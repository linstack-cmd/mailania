# Debug Logging Documentation Index

This directory now includes comprehensive documentation for the mobile swipe debug logging system.

## Quick Start

1. **Start the app:** `node dist/server/index.js`
2. **Open on mobile:** `http://localhost:3001`
3. **Access debug panel:** Tap "debug" button in bottom-right
4. **Reproduce bug:** Perform upward swipe from input area
5. **View logs:** Watch real-time events in debug panel

## Documentation Files

### 📄 IMPLEMENTATION_REPORT.md
**What:** Complete technical report
**Contains:**
- Implementation details of all changes
- Build verification results
- Step-by-step debugging instructions
- Expected vs buggy behavior
- Technical notes and performance impact
**Best for:** Understanding what was built and how to use it

### 📄 DEBUG_CHANGES_SUMMARY.md
**What:** Quick overview of changes
**Contains:**
- Files modified and lines changed
- Events being logged
- How to access the debug panel
- Key fields to watch
**Best for:** Quick reference on what changed

### 📄 TEST_DEBUG_LOGGING.md
**What:** Step-by-step testing guide
**Contains:**
- Setup instructions
- How to reproduce the bug
- What good behavior looks like
- What bad behavior looks like
- Specific metrics to monitor
**Best for:** Actually testing and reproducing the bug

### 📄 LOGGING_EVENTS_REFERENCE.md
**What:** Complete event reference guide
**Contains:**
- All 8 event types (touchstart, touchmove, touchend, scroll)
- Detailed field explanations with examples
- Expected event sequences for different gestures
- Bug pattern indicators
- Debugging tips
**Best for:** Understanding what each event means and its fields

## Event Summary

### Touch Events
- **touchstart** - User initiates touch
- **touchmove:lock** - Direction is determined
- **touchmove:horizontal** - User is panning horizontally
- **touchmove:vertical** - User is scrolling vertically
- **touchend** - User lifts finger
- **touchend:snap** - Snap animation triggered (horizontal only)

### Scroll Events
- **container:scroll** - Pane container position changed
- **chat:scroll** - Chat message area scrolled

## Key Debugging Questions

When you see unexpected behavior, ask:

1. **Direction Misclassification?**
   - Look for `touchmove:lock` with wrong direction
   - Check `absMoveX` vs `absMoveY` ratio

2. **Unexpected Container Scroll?**
   - Look for `container:scroll` events during vertical gesture
   - Should only happen during horizontal swipes

3. **Wrong Pane Snap?**
   - Look for `touchend:snap` when gesture was vertical
   - Should only snap on horizontal gestures

## Exporting Debug Data

To save logs for later analysis:

1. Tap "copy debug" button in debug panel
2. Paste into text editor or email
3. Look for the `swipeTouchLogs` array
4. Each entry has timestamp, event name, and detailed metrics

## Event Flow Example

### Good (Vertical Swipe)
```
touchstart: x=188, y=750, targetTag=TEXTAREA
touchmove:lock: direction=vertical, absMoveY=25, absMoveX=3
touchmove:vertical: ... (repeats)
touchend: direction=vertical, scrollLeft=0 (unchanged)
```

### Bad (Vertical Misclassified as Horizontal)
```
touchstart: x=188, y=750
touchmove:lock: direction=horizontal ← BUG!
touchmove:horizontal: scrollLeft changes ← BUG!
container:scroll: scrollLeft=45 ← BUG!
touchend:snap: trying to snap to pane 1 ← BUG!
```

## Files Modified

- ✅ `src/client/mobileDebug.tsx` - Added logging infrastructure (+104 lines)
- ✅ `src/client/MobileSwipePane.tsx` - Added touch logging (+92 lines)
- ✅ `src/client/ChatPanel.tsx` - Added scroll logging (+24 lines)

## Build Status

✅ TypeScript: PASS
✅ Vite: PASS
✅ Output: 273 KB (84 KB gzipped)
✅ No errors or warnings

## Next Steps

1. Run the app with the debug panel enabled
2. Reproduce the upward swipe issue
3. Capture the log sequence
4. Compare against expected behavior
5. Use the metrics to identify root cause
6. Fix the underlying issue

---

**Last Updated:** April 15, 2024
**Status:** Ready for testing ✅
