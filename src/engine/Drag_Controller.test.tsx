/**
 * DOM tests for Mandatory Rules:
 *   - Req 14.2: `setPointerCapture` MUST be called BEFORE the state machine
 *     transitions to `carried`.
 *   - Req 14.3: while `currentState === 'carried'`, the wrapper element has
 *     class `select-none`; the class is removed on exit.
 *
 * jsdom's PointerEvent constructor exists, but `setPointerCapture` and
 * `hasPointerCapture` are stubbed by jsdom (jsdom v23+). For deterministic
 * call-order assertions we monkey-patch the spy on the target element.
 *
 * **Validates: Requirements 14.2, 14.3**
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { useStore } from '../state/store';
import {
  useDragController,
  _resetForTest as _resetDrag,
  type DragControllerHandlers,
} from './Drag_Controller';

interface HarnessProps {
  handlers?: DragControllerHandlers;
  petRef?: { current: HTMLDivElement | null };
}

function Harness({ handlers, petRef }: HarnessProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { bind } = useDragController(wrapperRef, handlers ?? {});
  return (
    <div ref={wrapperRef} data-testid="wrapper">
      <div
        data-testid="pet"
        ref={(el) => {
          if (petRef) petRef.current = el;
        }}
        {...bind}
      />
    </div>
  );
}

describe('Mandatory Rule 14.2: setPointerCapture called BEFORE transition to carried', () => {
  afterEach(() => {
    _resetDrag();
    useStore.getState()._resetToDefaults();
  });

  it('setPointerCapture is invoked BEFORE onCarryStart (the carried transition trigger)', () => {
    const callOrder: string[] = [];
    const onCarryStart = vi.fn(() => {
      callOrder.push('onCarryStart');
    });

    const petRef: { current: HTMLDivElement | null } = { current: null };
    render(<Harness handlers={{ onCarryStart }} petRef={petRef} />);

    const pet = petRef.current!;
    expect(pet).not.toBeNull();

    // Monkey-patch the spy so we can record relative ordering. jsdom provides
    // a no-op implementation; we replace it with our recorder.
    pet.setPointerCapture = vi.fn(() => {
      callOrder.push('setPointerCapture');
    }) as unknown as HTMLElement['setPointerCapture'];

    act(() => {
      fireEvent.pointerDown(pet, {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        clientX: 250,
        clientY: 400,
        pointerType: 'mouse',
      });
    });

    const capIdx = callOrder.indexOf('setPointerCapture');
    const carryIdx = callOrder.indexOf('onCarryStart');
    expect(capIdx).toBeGreaterThanOrEqual(0);
    expect(carryIdx).toBeGreaterThanOrEqual(0);
    expect(capIdx).toBeLessThan(carryIdx);
  });

  it('does not capture pointer when secondary button is pressed (Req 5.8 guard)', () => {
    const onCarryStart = vi.fn();
    const petRef: { current: HTMLDivElement | null } = { current: null };
    render(<Harness handlers={{ onCarryStart }} petRef={petRef} />);

    const pet = petRef.current!;
    const captureSpy = vi.fn();
    pet.setPointerCapture = captureSpy as unknown as HTMLElement['setPointerCapture'];

    act(() => {
      fireEvent.pointerDown(pet, {
        pointerId: 1,
        button: 2,
        isPrimary: true,
        clientX: 0,
        clientY: 0,
        pointerType: 'mouse',
      });
    });

    expect(captureSpy).not.toHaveBeenCalled();
    expect(onCarryStart).not.toHaveBeenCalled();
  });
});

describe('Mandatory Rule 14.3: select-none class on wrapper while carried', () => {
  afterEach(() => {
    _resetDrag();
    useStore.getState()._resetToDefaults();
  });

  it('wrapper gains class "select-none" when currentState transitions to carried, and loses it on exit', () => {
    const { getByTestId } = render(<Harness />);
    const wrapper = getByTestId('wrapper');

    // Initially idle → no class
    expect(wrapper.classList.contains('select-none')).toBe(false);

    // Force state to carried via store action; the controller subscribes and applies the class.
    act(() => {
      useStore.getState().setPetState('carried');
    });
    expect(wrapper.classList.contains('select-none')).toBe(true);

    // Exit carried → class removed
    act(() => {
      useStore.getState().setPetState('idle');
    });
    expect(wrapper.classList.contains('select-none')).toBe(false);
  });

  it('class is cleaned up when the hook unmounts', () => {
    const { getByTestId, unmount } = render(<Harness />);
    const wrapper = getByTestId('wrapper');

    act(() => {
      useStore.getState().setPetState('carried');
    });
    expect(wrapper.classList.contains('select-none')).toBe(true);

    unmount();
    // After unmount the wrapper detaches from React, but its DOM node still
    // exists in `wrapper`. The cleanup must have removed the class before the
    // node was disconnected.
    expect(wrapper.classList.contains('select-none')).toBe(false);
  });
});
