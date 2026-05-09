import { useState, useCallback, useEffect } from 'react';
import { DashboardState } from '../types';
import { INITIAL_STATE, STORAGE_KEY } from '../constants';
import { cloneDeep, isEqual } from 'lodash';

export function useLayoutHistory() {
  const [state, setState] = useState<DashboardState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_STATE;
  });

  const [history, setHistory] = useState<DashboardState[]>([]);
  const [future, setFuture] = useState<DashboardState[]>([]);

  // Persist state to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateState = useCallback((newState: DashboardState) => {
    setState((current) => {
      if (isEqual(current, newState)) return current;
      
      setHistory((prev) => [...prev, current]);
      setFuture([]); // Clear future on new action
      return newState;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const newHistory = prev.slice(0, -1);
      
      setFuture((f) => [state, ...f]);
      setState(last);
      return newHistory;
    });
  }, [state]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      const newFuture = prev.slice(1);
      
      setHistory((h) => [...h, state]);
      setState(next);
      return newFuture;
    });
  }, [state]);

  const reset = useCallback(() => {
    updateState(INITIAL_STATE);
  }, [updateState]);

  const canUndo = history.length > 0;
  const canRedo = future.length > 0;

  return {
    state,
    updateState,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  };
}
