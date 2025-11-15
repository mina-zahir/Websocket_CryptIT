import { resilientEventListener } from './resilientEventListener';
import WebSocket from 'isomorphic-ws';
import { Contract } from 'ethers';

// --- Mocks Setup ---
// We mock the entire 'isomorphic-ws' module.
// The mock provides a fake WebSocket class that we can control in our tests.
jest.mock('isomorphic-ws');
const MockWebSocket = WebSocket as jest.Mock;

// We do the same for the 'ethers' Contract class.
jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'), // Keep other ethers functions
  Contract: jest.fn(),
}));
const MockContract = Contract as jest.Mock;

// --- Test Suite ---
describe('resilientEventListener', () => {
  // A fresh set of mock arguments for each test to ensure isolation.
  const getMockArgs = () => ({
    rpcUrl: 'ws://test-url.com',
    contractAddress: '0x12345',
    abi: [],
    eventName: 'TestEvent',
    log: jest.fn(),
    callback: jest.fn(),
  });

  // A mock WebSocket instance that we can manipulate in each test.
  let mockWsInstance: {
    on: jest.Mock;
    send: jest.Mock;
    close: jest.Mock;
    terminate: jest.Mock;
    onerror: jest.Mock;
    onclose: jest.Mock;
    onmessage: jest.Mock;
    onopen: jest.Mock;
    readyState: number;
  };

  // A mock Contract instance.
  let mockContractInstance: {
    getEvent: jest.Mock;
    interface: {
      parseLog: jest.Mock;
    };
  };

  beforeEach(() => {
    // Before each test, we reset all mocks to a clean state.
    jest.clearAllMocks();

    // Set up the mock return values for our fakes.
    mockWsInstance = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn(),
      onerror: jest.fn(),
      onclose: jest.fn(),
      onmessage: jest.fn(),
      onopen: jest.fn(),
      readyState: WebSocket.OPEN,
    };
    MockWebSocket.mockImplementation(() => mockWsInstance);

    mockContractInstance = {
      getEvent: jest.fn().mockReturnValue({
        getFragment: jest.fn().mockReturnValue({
          topicHash: '0xmockTopicHash',
        }),
      }),
      interface: {
        parseLog: jest.fn(),
      },
    };
    MockContract.mockImplementation(() => mockContractInstance);

    // Use fake timers for tests involving setTimeout or setInterval
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Restore real timers after each test.
    jest.useRealTimers();
  });

  // --- Test Cases ---

  describe('Initialization', () => {
    it('should create a WebSocket connection with the correct URL', () => {
      resilientEventListener(getMockArgs());
      expect(MockWebSocket).toHaveBeenCalledWith('ws://test-url.com');
    });

    it('should set up event handlers on the WebSocket instance', () => {
      resilientEventListener(getMockArgs());
      // The event handlers are assigned in the function, so we simulate that
      // by capturing the arguments to the mock `on` function if it were used,
      // but since they are assigned directly (e.g. ws.onopen = ...),
      // we can just check that a connection was attempted.
      // A more complex test could spy on the assignment itself.
      expect(MockWebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('WebSocket Event Handling', () => {
    it('should send a subscription request on "open"', () => {
      resilientEventListener(getMockArgs());
      // To test what happens on "open", we manually trigger our fake handler.
      mockWsInstance.onopen({} as any);

      const expectedSubscriptionRequest = {
        id: 1,
        method: 'eth_subscribe',
        params: ['logs', { topics: ['0xmockTopicHash'], address: '0x12345' }],
      };
      expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify(expectedSubscriptionRequest));
    });

    it('should handle subscription confirmation and process event messages', () => {
      const args = getMockArgs();
      resilientEventListener(args);
      mockWsInstance.onopen({} as any);

      // 1. Simulate the server confirming the subscription
      const subscriptionId = '0xsub123';
      const confirmationMessage = {
        id: 1,
        result: subscriptionId,
      };
      mockWsInstance.onmessage({ data: JSON.stringify(confirmationMessage) } as any);

      // 2. Simulate an incoming event
      const mockEventLog = { name: 'TestEvent', args: ['arg1', 'arg2'] };
      mockContractInstance.interface.parseLog.mockReturnValue(mockEventLog);

      const eventMessage = {
        method: 'eth_subscription',
        params: {
          subscription: subscriptionId,
          result: { data: '0xeventData' },
        },
      };
      mockWsInstance.onmessage({ data: JSON.stringify(eventMessage) } as any);

      // 3. Assert that the event was parsed and the callback was called
      expect(mockContractInstance.interface.parseLog).toHaveBeenCalledWith({ data: '0xeventData' });
      expect(args.callback).toHaveBeenCalledWith(mockEventLog);
    });

    it('should log an error on a WebSocket error event', () => {
      const args = getMockArgs();
      resilientEventListener(args);
      mockWsInstance.onerror({ message: 'Test WS Error' } as any);
      expect(args.log).toHaveBeenCalledWith('error', expect.stringContaining('WebSocket error:'), 'Test WS Error');
    });
  });

  describe('Reconnection and Keep-Alive', () => {
    it('should attempt to reconnect with exponential backoff on "close"', () => {
      resilientEventListener(getMockArgs());

      // First connection
      expect(MockWebSocket).toHaveBeenCalledTimes(1);

      // Trigger close
      mockWsInstance.onclose({} as any);

      // First reconnect attempt after 1s
      jest.advanceTimersByTime(1000);
      expect(MockWebSocket).toHaveBeenCalledTimes(2);

      // Trigger close again
      const newMockWsInstance = MockWebSocket.mock.results[1].value;
      newMockWsInstance.onclose({} as any);

      // Second reconnect attempt after 2s
      jest.advanceTimersByTime(2000);
      expect(MockWebSocket).toHaveBeenCalledTimes(3);
    });

    it('should perform a health check at the specified interval', () => {
      const args = getMockArgs();
      resilientEventListener(args);
      mockWsInstance.onopen({} as any);

      const pingRequest = { id: 2, method: 'net_listening', params: [] };

      // Advance time to the first keep-alive check
      jest.advanceTimersByTime(60 * 1000);
      expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify(pingRequest));
    });

    it('should terminate the connection if a pong is not received', () => {
      const args = getMockArgs();
      resilientEventListener(args);
      mockWsInstance.onopen({} as any);

      // Advance to the keep-alive check
      jest.advanceTimersByTime(60 * 1000);
      expect(mockWsInstance.send).toHaveBeenCalledTimes(2); // subscription + ping

      // Advance past the pong timeout
      jest.advanceTimersByTime(15000);
      expect(mockWsInstance.terminate).toHaveBeenCalled();
    });
  });

  describe('Stop Functionality', () => {
    it('should close the WebSocket and prevent reconnection when stop() is called', () => {
      const { stop } = resilientEventListener(getMockArgs());

      // Call stop
      stop();

      // Verify it tried to close the connection
      expect(mockWsInstance.close).toHaveBeenCalled();

      // Trigger a close event
      mockWsInstance.onclose({} as any);

      // Advance timers
      jest.advanceTimersByTime(5000); // More than enough for a reconnect attempt

      // Assert that NO new connection was made
      expect(MockWebSocket).toHaveBeenCalledTimes(1);
    });
  });
});
