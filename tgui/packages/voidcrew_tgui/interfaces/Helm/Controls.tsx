/**
 * Bottom console: throttle, steering rose, velocity cluster and the operations
 * row. Native tgui components throughout.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Icon,
  LabeledList,
  Slider,
  Stack,
} from 'tgui-core/components';

import { useBackend } from '../../backend';
import {
  BURN_NONE,
  BURN_STOP,
  type Data,
  DIR,
  DIR_VECTOR,
} from './data';
import {
  bearingOf,
  deciToClock,
  deciToSeconds,
  useContacts,
  useDockMenuControl,
  useDrift,
  useLocked,
} from './hooks';

// One act() per pointermove is one BYOND Topic call per mouse pixel. The knob
// tracks the cursor from local state and the server hears at most one value per
// interval, plus the final one.
const THROTTLE_SEND_MS = 200;

export const Throttle = () => {
  const { act, data } = useBackend<Data>();
  const locked = useLocked();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const lastSent = useRef({ value: -1, at: 0 });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const burnPercentage = dragValue ?? data.burnPercentage;

  const send = (value: number, force: boolean) => {
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    if (value === lastSent.current.value) return;
    const wait = THROTTLE_SEND_MS - (Date.now() - lastSent.current.at);
    if (!force && wait > 0) {
      pending.current = setTimeout(() => send(value, true), wait);
      return;
    }
    lastSent.current = { value, at: Date.now() };
    act('change_burn_percentage', { percentage: value });
  };

  useEffect(() => {
    if (dragValue === null) return;
    const settled = data.burnPercentage === dragValue;
    const refused = !pending.current && Date.now() - lastSent.current.at > 1500;
    if (settled || refused) setDragValue(null);
  }, [data.burnPercentage, dragValue]);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return (
    <Stack vertical>
      <Stack.Item>
        <Slider
          value={burnPercentage}
          minValue={1}
          maxValue={100}
          step={1}
          stepPixelSize={4}
          disabled={locked}
          unit="%"
          onDrag={(_event, value) => {
            setDragValue(value);
            send(value, false);
          }}
          onChange={(_event, value) => {
            setDragValue(value);
            send(value, true);
          }}
        />
      </Stack.Item>
      <Stack.Item color="label" textAlign="center">
        Cruise
      </Stack.Item>
    </Stack>
  );
};

type RoseCell = {
  name: string;
  direction: number;
  rotation: number;
};

const ROSE_CELLS: RoseCell[] = [
  { name: 'Northwest', direction: DIR.NW, rotation: -45 },
  { name: 'North', direction: DIR.N, rotation: 0 },
  { name: 'Northeast', direction: DIR.NE, rotation: 45 },
  { name: 'West', direction: DIR.W, rotation: -90 },
  { name: 'Brake', direction: BURN_STOP, rotation: 0 },
  { name: 'East', direction: DIR.E, rotation: 90 },
  { name: 'Southwest', direction: DIR.SW, rotation: -135 },
  { name: 'South', direction: DIR.S, rotation: 180 },
  { name: 'Southeast', direction: DIR.SE, rotation: 135 },
];

export const HelmRose = () => {
  const { act, data } = useBackend<Data>();
  const {
    burnDirection,
    commandedCourse,
    canThrust,
    shipDisabled,
    state,
    zone_transitioning,
  } = data;
  const locked = useLocked();

  const flyable = state === 'flying' && !shipDisabled && !locked;
  const canMove = flyable && !!canThrust && !zone_transitioning;

  const cells = ROSE_CELLS.map((cell) => {
    const isStop = cell.direction === BURN_STOP;
    const lit = isStop
      ? burnDirection === BURN_STOP
      : commandedCourse === cell.direction;
    return (
      <Button
        key={cell.name}
        selected={lit}
        color={isStop ? 'bad' : undefined}
        disabled={isStop ? !flyable && !zone_transitioning : !canMove}
        tooltip={
          isStop
            ? zone_transitioning
              ? 'Cancel zone transition'
              : burnDirection === BURN_STOP
                ? 'Braking, click to coast'
                : 'Brake'
            : lit
              ? `Flying ${cell.name.toLowerCase()}, click to coast`
              : `Fly ${cell.name.toLowerCase()}, drift is shed automatically`
        }
        onClick={() =>
          isStop ? act('stop') : act('change_heading', { dir: cell.direction })
        }
      >
        <Icon
          name={isStop ? 'square' : 'arrow-up'}
          rotation={isStop ? 0 : cell.rotation}
        />
      </Button>
    );
  });

  return (
    <Stack vertical align="center">
      {[0, 1, 2].map((row) => (
        <Stack.Item key={row}>
          <Stack>
            {[0, 1, 2].map((col) => (
              <Stack.Item key={col}>{cells[row * 3 + col]}</Stack.Item>
            ))}
          </Stack>
        </Stack.Item>
      ))}
    </Stack>
  );
};

export const VelocityCluster = () => {
  const { data } = useBackend<Data>();
  const {
    speed = 0,
    heading,
    eta,
    burnPercentage,
    burnDirection,
    commandedCourse,
    cruiseTargetSpeed,
  } = data;
  const drift = useDrift(useContacts());

  const courseVector =
    commandedCourse !== BURN_NONE && burnDirection === BURN_NONE && speed > 0
      ? DIR_VECTOR[commandedCourse]
      : undefined;
  const showCruiseTarget =
    Number.isFinite(cruiseTargetSpeed) && cruiseTargetSpeed > 0;

  const vectorLabel = burnDirection === BURN_STOP
    ? 'Brake'
    : burnDirection !== BURN_NONE
      ? heading
      : courseVector
        ? `Cruise ${bearingOf(courseVector[0], courseVector[1])}`
        : drift
          ? `Coast ${bearingOf(drift.vector[0], drift.vector[1])}`
          : 'Hold';

  return (
    <LabeledList>
      <LabeledList.Item label="Speed">
        {speed.toFixed(1)} t/min
      </LabeledList.Item>
      <LabeledList.Item label="Heading">{vectorLabel}</LabeledList.Item>
      <LabeledList.Item label="Next tile">{eta || '-'}</LabeledList.Item>
      <LabeledList.Item label="Throttle">
        {burnPercentage}%
        {!!showCruiseTarget && (
          <Box as="span" color="label" ml={1}>
            → {cruiseTargetSpeed.toFixed(1)} t/min
          </Box>
        )}
      </LabeledList.Item>
    </LabeledList>
  );
};

export const OpsRow = () => {
  const { act, data } = useBackend<Data>();
  const {
    state,
    shipDisabled,
    undockCooldown,
    undockCooldownRemaining,
    undockLocked,
    undockLockoutRemaining,
    integrityLockout,
    integrityLockoutRemaining,
    dockWarmup,
    dockWarmupRemaining,
    undockWarmup,
    undockWarmupRemaining,
    cargoShuttlePresent,
    onNebula,
    hiddenInNebula,
    nebulaHideWarmup,
    nebulaHideRemaining,
    zone_transitioning,
    calibrating,
    dockOptions,
    speed,
    dockAssistMaxSpeed,
    distress,
  } = data;
  const locked = useLocked();
  const openDockPicker = useDockMenuControl();
  const flyable = state === 'flying' && !shipDisabled && !locked;
  const dockSpeedLimit = dockAssistMaxSpeed ?? 0;
  const tooFastToDock = speed > dockSpeedLimit;
  const autoStopping = speed > 0 && !tooFastToDock;

  const options = dockOptions ?? [];
  const multipleDockOptions = options.length > 1;
  const primaryDockOption = options[0];
  const dockName = primaryDockOption?.name ?? 'empty space';
  const runDock = (option?: Data['dockOptions'][number]) =>
    act('dock', option?.ref ? { target: option.ref } : {});

  const undockDisabled =
    (state !== 'idle' && state !== 'undocking') ||
    !!shipDisabled ||
    locked ||
    !!undockCooldown ||
    !!undockLocked ||
    !!integrityLockout ||
    !!undockWarmup ||
    !!cargoShuttlePresent;

  const manoeuvring =
    state === 'docking' || state === 'undocking' || state === 'acting';
  const manoeuvringLabel =
    state === 'docking'
      ? 'Docking sequence in progress'
      : state === 'undocking'
        ? 'Undocking sequence in progress'
        : 'Plotting approach vector';

  const undockReason = () => {
    if (undockWarmup)
      return `Undocking in ${deciToSeconds(undockWarmupRemaining)}s`;
    if (cargoShuttlePresent) return 'Cargo shuttle aboard. Send it away first';
    if (undockCooldown)
      return `Systems stabilising, ${deciToSeconds(undockCooldownRemaining)}s`;
    if (undockLocked)
      return `Interdiction lockout, ${deciToSeconds(undockLockoutRemaining)}s`;
    if (integrityLockout)
      return `Hull failure, recertification ${deciToClock(integrityLockoutRemaining)}`;
    if (manoeuvring) return manoeuvringLabel;
    if (state !== 'idle' && state !== 'undocking') return 'Already underway';
    return 'Clear moorings and get underway';
  };

  const dockReason = () => {
    if (dockWarmup) return `Docking in ${deciToSeconds(dockWarmupRemaining)}s`;
    if (manoeuvring) return manoeuvringLabel;
    if (tooFastToDock) {
      return dockSpeedLimit > 0
        ? `Slow below ${dockSpeedLimit} tiles/min to make a docking approach`
        : multipleDockOptions
          ? 'Come to a full stop to dock'
          : `Come to a full stop to dock with ${dockName}`;
    }
    if (multipleDockOptions) {
      return autoStopping
        ? `Auto-stop, then choose from ${options.length} docking options here`
        : `Choose from ${options.length} docking options here`;
    }
    if (primaryDockOption?.isEmpty) {
      return autoStopping
        ? 'Auto-stop and hold position here in empty space'
        : 'Hold position here in empty space';
    }
    return autoStopping
      ? `Auto-stop and dock with ${dockName}`
      : `Dock with ${dockName}`;
  };

  return (
    <Stack>
      <Stack.Item grow>
        <Button fluid icon="anchor" disabled={undockDisabled} tooltip={undockReason()} onClick={() => act('undock')}>
          {undockWarmup
            ? `Undock ${deciToSeconds(undockWarmupRemaining)}s`
            : 'Undock'}
        </Button>
      </Stack.Item>
      <Stack.Item grow>
        <Button
          fluid
          icon="anchor-circle-check"
          disabled={
            !flyable ||
            tooFastToDock ||
            !!dockWarmup ||
            !!zone_transitioning ||
            !!hiddenInNebula
          }
          tooltip={dockReason()}
          onClick={(event) =>
            multipleDockOptions ? openDockPicker(event) : runDock(primaryDockOption)
          }
        >
          {dockWarmup
            ? `Dock ${deciToSeconds(dockWarmupRemaining)}s`
            : multipleDockOptions
              ? `Dock (${options.length})`
              : 'Dock'}
        </Button>
      </Stack.Item>
      <Stack.Item grow>
        <Button
          fluid
          icon={hiddenInNebula ? 'eye' : 'eye-slash'}
          selected={!!hiddenInNebula}
          disabled={
            hiddenInNebula
              ? locked
              : !flyable || !onNebula || !!nebulaHideWarmup || !!zone_transitioning
          }
          tooltip={
            hiddenInNebula
              ? 'Break concealment and become visible again'
              : onNebula
                ? 'Hide the ship inside this nebula'
                : 'Fly onto a nebula tile to conceal the ship'
          }
          onClick={() =>
            act(hiddenInNebula ? 'unhide_from_nebula' : 'hide_in_nebula')
          }
        >
          {hiddenInNebula
            ? 'Emerge'
            : nebulaHideWarmup
              ? `Cloak ${deciToSeconds(nebulaHideRemaining)}s`
              : 'Cloak'}
        </Button>
      </Stack.Item>
      <Stack.Item grow>
        <Button
          fluid
          icon="broadcast-tower"
          color={distress?.active ? 'bad' : undefined}
          selected={!!distress?.active}
          disabled={locked || !!distress?.cooldown}
          tooltip={
            distress?.active
              ? `Shut the beacon down. Currently transmitting: "${distress.message ?? ''}"`
              : 'Broadcast a distress call on Wideband and put this ship on every helm chart in the galaxy'
          }
          onClick={() => act('distress')}
        >
          {distress?.active
            ? 'Distress on'
            : distress?.cooldown
              ? `Distress ${deciToSeconds(distress.cooldownRemaining)}s`
              : 'Distress'}
        </Button>
      </Stack.Item>
      <Stack.Item grow>
        <Button
          fluid
          icon="bolt"
          disabled={!flyable || !!zone_transitioning || !!hiddenInNebula}
          tooltip={
            calibrating
              ? 'Cancel the bluespace jump'
              : 'Calibrate a bluespace jump, this ends the round for your ship'
          }
          onClick={() => act('bluespace_jump')}
        >
          {calibrating ? 'Calibrating' : 'Bluespace'}
        </Button>
      </Stack.Item>
    </Stack>
  );
};
