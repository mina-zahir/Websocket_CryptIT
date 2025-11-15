# CryptIT
My main goal was to refactor the WebSocket client in **resilientEventListener.ts** to make it much 
more robust and resilient to errors, while ensuring it continued to work with the rest of the 
application.

Here’s a breakdown of the key improvements I made:

1. **Exponential Backoff for Reconnection:** The original code would try to reconnect every 
second after a disconnection. I replaced this with an "exponential backoff" strategy. Now, 
if the connection drops, it waits 1 second, then 2, then 4, and so on (up to a limit). This is 
much healthier as it prevents overwhelming the server with constant reconnection 
attempts.

2. **Improved Error Handling:**

   - **JSON Parsing:** I wrapped the code that parses incoming messages in 
     a try...catch block. This prevents the client from crashing if it receives a 
     malformed or unexpected message from the server.

   - **Unexpected Responses:** I added a specific handler for unexpected-
     response events, which can happen if there's an issue during the initial 
     connection setup (e.g., an HTTP error).

3. **More Control Over the Listener:** I introduced a stopped flag. Now, when you call 
the **stop()** function, it truly stops and won't try to reconnect anymore. The previous 
version would have kept trying to reconnect even after **stop()** was called.

4. **Enhanced and Structured Logging:** I modified the logging function to use different log 
levels (like info, warn, error). This makes the logs much cleaner and more useful for 
debugging, as you can easily filter messages by severity.

5. **Configuration Options:** I made the timers for the keep-alive health checks configurable, 
so they can be easily adjusted without needing to change the code.

---

I added **Unit Tests(using Jest)** to the project to ensure its quality and stability:

**Unit Tests**

These tests focus **only** on the **resilientEventListener.ts** file, checking its internal logic in isolation 
without making any real network connections.

**Key things I tested:**

- **Initialization:** Verifies that a new WebSocket connection is attempted with the correct 
  URL when the listener starts.

- **Event Handling:** Confirms that when a new event message is received, it is correctly 
  parsed and the user's callback function is triggered.

- **Reconnection Logic:** Simulates a connection drop (**onclose** event) and asserts that the 
  client automatically tries to reconnect after a delay.

- **Keep-Alive:** Checks that the client periodically sends "ping" messages to keep the 
  connection alive and terminates the connection if it doesn't get a response.

- **Stop Functionality:** Ensures that calling the **stop()** function properly closes the 
  connection and, crucially, prevents any further reconnection attempts.

