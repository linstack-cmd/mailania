# Testing the Debug Logging System

## Setup

1. The app is built and ready at `/tmp/mailania`
2. To run: `node dist/server/index.js` (with `LOCAL_DEV_NO_AUTH=true` in .env)
3. Access at `http://localhost:3001` on mobile (375x812 viewport recommended)

## What's Been Added

The debug system now captures:

### **Touch Events**
- `touchstart` - Initial touch point, target element
- `touchmove:lock` - When direction is determined (horizontal vs vertical)
- `touchmove:horizontal` - During pane swiping
- `touchmove:vertical` - During vertical scroll
- `touchend` - Touch completion and snap decision
- `touchend:snap` - Pane snapping details (velocity, threshold, etc.)

### **Scroll Events**
- `container:scroll` - Pane container scrolling (swipe position)
- `chat:scroll` - Chat message area scrolling (vertical scroll inside chat)

## How to Access the Debug Panel

1. **Locate the debug button**
   - Bottom-right corner of screen
   - Small dark button with text "debug"

2. **Open the panel**
   - Tap the "debug" button
   - Panel slides up showing touch/scroll logs
   - Button text changes to "×" (close)

3. **View logs in real-time**
   - Each log entry shows:
     - Event name (blue text)
     - Timestamp (gray text)
     - Key metrics (yellow values)
   - Latest events appear at the bottom
   - Buffer keeps last 50 events

4. **Export for debugging**
   - Tap "copy debug" button in panel
   - Full debug state copied to clipboard
   - Includes all logs + other app state
   - Can paste into text editor or send to developers

## Reproducing the Bug

### The Issue
Swiping upward from the input area causes unexpected behavior.

### Test Steps

1. Open the app on mobile
2. Open the debug panel (tap "debug" button)
3. Locate the input area at the bottom
4. Perform a quick upward swipe from the input area
5. Watch the logs in real-time

### What to Look For

**Good behavior:**
```
touchstart: x=..., y=..., targetTag=INPUT|TEXTAREA
touchmove:lock: direction=vertical  ← key indicator
touchmove:vertical: absMoveX≪absMoveY (much smaller X movement)
touchend: direction=vertical
```

**Bad behavior (misclassified as horizontal):**
```
touchstart: x=..., y=...
touchmove:lock: direction=horizontal  ← WRONG!
touchmove:horizontal: container scrolling
container:scroll: scrollLeft changes
```

## Specific Metrics to Monitor

### Touch Disambiguation
- `absMoveX` - Horizontal movement magnitude
- `absMoveY` - Vertical movement magnitude
- The code requires `absMoveX > absMoveY * 2` for horizontal lock
- If true upward swipe triggers horizontal: this is the bug

### Container Scroll Changes
- Look for `container:scroll` entries with non-zero `delta`
- During a pure vertical swipe, should see no `container:scroll` events
- Any `container:scroll` during a vertical swipe = wrong behavior

### Chat Scroll Activity
- `chat:scroll` entries show message area scrolling
- Should see these during vertical swipes if chat has scrollable content
- Indicates the vertical scroll is being handled correctly

## Copying the Full Debug State

To send diagnostic data to developers:

1. Tap the "copy debug" button in the debug panel
2. Paste the copied text somewhere (Notes app, email, etc.)
3. Look for the `swipeTouchLogs` array:
   ```json
   {
     "swipeTouchLogs": [
       {
         "time": "2024-04-15T21:13:45.123Z",
         "event": "touchstart",
         "details": { "x": 188, "y": 750, ... }
       },
       ...
     ]
   }
   ```

## Clearing the Logs

To reset and test again:

1. Reload the page (browser refresh)
2. Debug logs will be cleared
3. Open the debug panel and reproduce the bug with clean logs

## Performance Notes

- Debug logging has minimal overhead
- Buffer limited to 50 events (prevents memory bloat)
- All logging is client-side (no network requests)
- Timestamps are ISO format (high precision)

## Questions to Answer with This Data

Once you capture a full log sequence of the bug:

1. Is `touchmove:lock` setting `direction: "horizontal"` for an upward swipe?
2. If so, what are `absMoveX` and `absMoveY` values?
3. Does `container:scroll` show the pane moving unexpectedly?
4. Is the touch target correct (`targetTag`, `targetClass`)?
5. What's the timing between `touchstart` and `touchmove:lock`?

This data will pinpoint exactly where the bug occurs.
