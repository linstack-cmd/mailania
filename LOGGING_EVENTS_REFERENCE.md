# Complete Touch & Scroll Logging Events Reference

## Event List

### Touch Events in MobileSwipePane

#### 1. `touchstart`
**When:** User initiates touch on the swipe container
**Details captured:**
- `x, y` - Touch origin coordinates
- `targetTag` - HTML element tag (INPUT, TEXTAREA, DIV, etc.)
- `targetClass` - CSS classes of the touched element
- `startScrollLeft` - Container scroll position at start

**Example:**
```json
{
  "event": "touchstart",
  "details": {
    "x": 188,
    "y": 750,
    "targetTag": "TEXTAREA",
    "targetClass": "css-...",
    "startScrollLeft": 0
  }
}
```

#### 2. `touchmove:lock`
**When:** First significant movement detected (10px+ in any direction)
**Details captured:**
- `direction` - "horizontal" or "vertical" (locked-in direction)
- `absMoveX, absMoveY` - Absolute displacement in each axis
- `moveX, moveY` - Raw movement deltas
- `scrollLeft` - Container position at lock point

**Critical:** The lock requires `absMoveX > absMoveY * 2` for horizontal

**Example:**
```json
{
  "event": "touchmove:lock",
  "details": {
    "direction": "vertical",
    "absMoveX": 5,
    "absMoveY": 25,
    "moveX": 2,
    "moveY": -25,
    "scrollLeft": 0
  }
}
```

#### 3. `touchmove:horizontal`
**When:** Direction is locked to horizontal AND still moving
**Details captured:**
- `direction` - Always "horizontal"
- `absMoveX, absMoveY` - Current movement magnitudes
- `moveX, moveY` - Current deltas
- `scrollLeft` - Current container scroll position
- `newScrollLeft` - Calculated new scroll position
- `containerWidth` - Full container width

**Example:**
```json
{
  "event": "touchmove:horizontal",
  "details": {
    "direction": "horizontal",
    "absMoveX": 45,
    "absMoveY": 18,
    "moveX": 45,
    "moveY": -18,
    "scrollLeft": 45,
    "newScrollLeft": 45,
    "containerWidth": 375
  }
}
```

#### 4. `touchmove:vertical`
**When:** Direction is locked to vertical AND still moving
**Details captured:**
- `direction` - Always "vertical"
- `absMoveX, absMoveY` - Current movement magnitudes
- `moveX, moveY` - Current deltas
- `scrollLeft` - Container scroll (should stay same)

**Note:** Vertical moves should NOT trigger preventDefault()

**Example:**
```json
{
  "event": "touchmove:vertical",
  "details": {
    "direction": "vertical",
    "absMoveX": 8,
    "absMoveY": 120,
    "moveX": 3,
    "moveY": -120,
    "scrollLeft": 0
  }
}
```

#### 5. `touchend`
**When:** User lifts finger (any direction)
**Details captured:**
- `direction` - Final direction lock state (or "none")
- `finalScrollLeft` - Container scroll position at end
- `startScrollLeft` - Starting scroll position
- `duration` - Total touch duration in milliseconds

**Always logged** - even for vertical touches to track gesture completion

**Example:**
```json
{
  "event": "touchend",
  "details": {
    "direction": "vertical",
    "finalScrollLeft": 0,
    "startScrollLeft": 0,
    "duration": 450
  }
}
```

#### 6. `touchend:snap`
**When:** Touch was horizontal - snap animation being triggered
**Details captured:**
- `startingPaneIndex` - Pane we started on (0=chat, 1=suggestions)
- `targetPaneIndex` - Pane we're snapping to
- `snapReason` - Why snapping: "threshold" (drag >30%), "velocity" (fast flick), or "default" (return)
- `dragDistance` - Total pixels dragged (startScrollLeft - currentScrollLeft)
- `dragPercentage` - Drag distance as % of pane width
- `velocity` - Calculated swipe speed (px/ms)
- `velocityThreshold` - Minimum velocity needed for flick snap

**Example:**
```json
{
  "event": "touchend:snap",
  "details": {
    "startingPaneIndex": 0,
    "targetPaneIndex": 1,
    "snapReason": "threshold",
    "dragDistance": 120,
    "dragPercentage": 0.32,
    "velocity": 0.27,
    "velocityThreshold": 0.5
  }
}
```

---

### Scroll Events

#### 7. `container:scroll`
**Where:** Main pane container (controls left/right position)
**When:** Container scroll changes (from touch input or snap animation)
**Details captured:**
- `scrollLeft` - Current horizontal scroll position
- `previousScrollLeft` - Previous scroll position
- `delta` - Change amount (scrollLeft - previousScrollLeft)
- `paneIndex` - Which pane is in view (0 or 1)

**Note:** During smooth snap animation, you'll see continuous scroll events

**Example:**
```json
{
  "event": "container:scroll",
  "details": {
    "scrollLeft": 45,
    "previousScrollLeft": 0,
    "delta": 45,
    "paneIndex": 0
  }
}
```

#### 8. `chat:scroll`
**Where:** Chat message area scroll container (left pane)
**When:** User scrolls messages up/down
**Details captured:**
- `scrollTop` - Current vertical scroll position
- `previousScrollTop` - Previous scroll position
- `delta` - Change amount (positive = scrolling down, negative = up)
- `scrollHeight` - Total content height
- `clientHeight` - Visible area height

**Tells us:** Chat area scroll behavior (should work independently of pane swipe)

**Example:**
```json
{
  "event": "chat:scroll",
  "details": {
    "scrollTop": 120,
    "previousScrollTop": 100,
    "delta": 20,
    "scrollHeight": 1200,
    "clientHeight": 600
  }
}
```

---

## How Events Should Flow (Normal Vertical Swipe)

Expected sequence for a good upward swipe from input area:

```
1. touchstart: x=188, y=750, targetTag=TEXTAREA
2. touchmove:lock: direction=vertical, absMoveX=3, absMoveY=25
3. touchmove:vertical: direction=vertical, ... (repeats)
4. touchmove:vertical: direction=vertical, ... (repeats)
5. touchend: direction=vertical, finalScrollLeft=0
```

**Key observations:**
- No `touchmove:horizontal` events
- No `container:scroll` events (scrollLeft stays 0)
- Maybe `chat:scroll` events (if scrolling message area)
- Direction locks to vertical and stays vertical
- `finalScrollLeft` matches `startScrollLeft`

---

## How Events Should Flow (Normal Horizontal Swipe)

Expected sequence for a left swipe to show suggestions:

```
1. touchstart: x=188, y=400, targetTag=DIV
2. touchmove:lock: direction=horizontal, absMoveX=25, absMoveY=8
3. touchmove:horizontal: direction=horizontal, ... (repeats)
4. touchmove:horizontal: direction=horizontal, ... (repeats)
5. touchend: direction=horizontal, finalScrollLeft=120, startScrollLeft=0
6. touchend:snap: targetPaneIndex=1, snapReason=threshold
7. container:scroll: scrollLeft=375, ... (snap animation)
8. container:scroll: scrollLeft=375, ... (snap complete)
```

**Key observations:**
- Direction locks to horizontal
- `touchmove:horizontal` events show container scrolling
- `container:scroll` events track the pan
- `touchend:snap` shows which pane we're snapping to
- Container animates to final pane position

---

## Bug Indicators

Watch for these patterns indicating the bug:

### **Pattern 1: Misclassified Direction**
```
✗ touchstart: x=188, y=750, targetTag=TEXTAREA
✗ touchmove:lock: direction=horizontal, absMoveX=8, absMoveY=150  ← WRONG!
```
Vertical swipe being classified as horizontal

### **Pattern 2: Unexpected Container Scroll**
```
✓ touchstart: ...
✓ touchmove:lock: direction=vertical, ...
✗ container:scroll: scrollLeft=45, delta=45  ← SHOULDN'T HAPPEN
```
Container scrolling during vertical drag

### **Pattern 3: Snap on Vertical**
```
✓ touchstart: ...
✓ touchmove:lock: direction=vertical, ...
✓ touchend: direction=vertical, ...
✗ touchend:snap: targetPaneIndex=1  ← SHOULDN'T HAPPEN
```
Trying to snap panes on a vertical gesture

---

## Debugging Tips

1. **Slow motion testing:** Use browser DevTools to slowdown touch simulation
2. **Capture clean logs:** Reload before each test to start fresh
3. **Compare logs:** Test on different input elements (TEXTAREA vs DIV)
4. **Watch deltas:** Look at movement magnitudes - very small X movement shouldn't lock horizontal
5. **Timing:** Note the delay between touchstart and touchmove:lock - lag could cause issues
