# Mobile Swipe Debug Logging - Changes Summary

## Overview
Added comprehensive touch and scroll event logging to debug the upward swipe issue from the input area.

## Files Modified

### 1. `src/client/mobileDebug.tsx`
**Changes:**
- Added `swipeTouchLogs` field to `MailaniaMobileDebugState` interface
  - Type: `Array<{ time: string; event: string; details: Record<string, any> }>`
  - Max 50 entries to avoid memory bloat
  
- Added `logSwipeTouchEvent()` helper function
  - Captures event name and arbitrary details
  - Maintains rolling buffer of last 50 events
  
- Enhanced `MobileDebugOverlay()` UI
  - Toggle button to show/hide debug panel
  - Real-time display of touch/scroll logs
  - Color-coded event types and values
  - Copyable JSON debug state (existing feature)

### 2. `src/client/MobileSwipePane.tsx`
**Changes:**
- Imported `logSwipeTouchEvent` from mobileDebug

**Touch Event Logging:**

- **touchstart**: Logs initial touch position and target element
  - `x, y`: Touch origin coordinates
  - `targetTag`: HTML element that received touch
  - `targetClass`: CSS classes of target
  - `startScrollLeft`: Container scroll position at start

- **touchmove events** (3 variants):
  - `touchmove:lock`: When direction is first determined
    - `direction`: "horizontal" or "vertical"
    - `absMoveX, absMoveY`: Absolute movement distances
    - `moveX, moveY`: Raw movement deltas
    - `scrollLeft`: Current container scroll
    
  - `touchmove:horizontal`: During horizontal pan
    - All above + `newScrollLeft`, `containerWidth`
    
  - `touchmove:vertical`: During vertical scroll
    - Movement data without scroll updates

- **touchend**: Always logged (even for vertical)
  - `direction`: Final direction lock state
  - `finalScrollLeft`: End position
  - `startScrollLeft`: Starting position
  - `duration`: Touch gesture duration (ms)

- **touchend:snap**: Additional snapping details
  - `startingPaneIndex, targetPaneIndex`: Pane transitions
  - `snapReason`: "default", "threshold", or "velocity"
  - `dragDistance, dragPercentage`: Movement magnitude
  - `velocity`: Calculated swipe velocity

**Scroll Events:**

- **container:scroll**: Pane container scroll changes
  - `scrollLeft`: Current position
  - `previousScrollLeft`: Before position
  - `delta`: Direction and magnitude
  - `paneIndex`: Which pane is visible

### 3. `src/client/ChatPanel.tsx`
**Changes:**
- Imported `logSwipeTouchEvent` from mobileDebug
- Added scroll event listener to chat scroll area
  - **chat:scroll**: Messages area scroll events
    - `scrollTop`: Current scroll position
    - `previousScrollTop`: Previous position
    - `delta`: Direction and magnitude
    - `scrollHeight, clientHeight`: Content dimensions

## How to Use

1. **Access Debug Panel:**
   - Click the "debug" button in bottom-right corner
   - Toggle the panel open/closed

2. **Monitor Events:**
   - Perform the upward swipe from input area
   - Watch real-time log entries appear
   - Each log shows: event name, timestamp, detailed metrics

3. **Export Data:**
   - Click "copy debug" button in the panel
   - Full debug state (JSON) copied to clipboard
   - Includes all touch/scroll logs

## Key Fields to Watch

When reproducing the bug:
- `touchstart.targetTag` - What element was touched?
- `touchmove:lock.direction` - Was it locked as vertical or horizontal?
- `touchmove:vertical` events - Any unexpected horizontal scroll during vertical move?
- `container:scroll.delta` - Is container scrolling when it shouldn't?
- `chat:scroll` events - Is the chat area being affected?

This should reveal whether:
- The touch is being misclassified as horizontal
- The container is scrolling unexpectedly
- Events are bubbling/propagating incorrectly
