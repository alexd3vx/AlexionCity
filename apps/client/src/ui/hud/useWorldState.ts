import { useEffect, useState } from 'react';
import type { World, WorldState } from '../../game/world';

/** The world's latest state, a few times a second. */
export function useWorldState(world: World | undefined): WorldState | undefined {
  const [state, setState] = useState<WorldState | undefined>();
  useEffect(() => {
    setState(undefined);
    return world?.onState(setState);
  }, [world]);
  return state;
}
