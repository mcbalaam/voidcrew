/** Full-console overlays: hull critical and abandoned-ship claim. Native tgui. */
import { Box, Button, Dimmer, ProgressBar } from 'tgui-core/components';

import { useBackend } from '../../backend';
import type { Data } from './data';

export const CrashOverlay = (props: { current: number; total: number }) => {
  const { current, total } = props;

  return (
    <Dimmer>
      <Box
        backgroundColor="black"
        p={2}
        width="24em"
        style={{ border: '1px solid #cf4a38' }}
        textAlign="center"
      >
        <Box bold color="bad" fontSize="1.2em">
          Hull integrity critical
        </Box>
        <Box mt={1} color="label">
          Ship systems are offline. Rebuild hull mass to restore functionality.
        </Box>
        <Box mt={1}>
          <ProgressBar
            value={current}
            minValue={0}
            maxValue={total}
            color="bad"
          >
            {current} / {total}
          </ProgressBar>
        </Box>
        <Box mt={1} color="label">
          {Math.max(0, total - current)} mass remaining
        </Box>
      </Box>
    </Dimmer>
  );
};

export const AbandonedOverlay = () => {
  const { act, data } = useBackend<Data>();
  if (!data.isAbandoned || data.isViewer) return null;

  return (
    <Dimmer>
      <Box
        backgroundColor="black"
        p={2}
        width="24em"
        style={{ border: '1px solid #d9a230' }}
        textAlign="center"
      >
        <Box bold color="average" fontSize="1.2em">
          Vessel abandoned
        </Box>
        <Box mt={1} color="label">
          No command authorization is registered to this ship. Claiming it makes
          you its commanding officer.
        </Box>
        <Box mt={2}>
          <Button icon="flag" color="good" onClick={() => act('claim_abandoned')}>
            Claim this ship
          </Button>
        </Box>
      </Box>
    </Dimmer>
  );
};
