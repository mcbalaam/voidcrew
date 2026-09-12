/**
 * Top-rail and instrument-stack panels: identity, zone, alerts, hull, fuel,
 * drive and sensors. Native tgui components throughout.
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Icon,
  Input,
  LabeledList,
  ProgressBar,
  Stack,
  Tooltip,
} from 'tgui-core/components';

import { useBackend } from '../../backend';
import { BURN_NONE, BURN_STOP, type Data, SCAN_TYPES } from './data';
import {
  clockOf,
  deciToSeconds,
  useContacts,
  useDrift,
  useLocked,
} from './hooks';

export const Ident = () => {
  const { act, data } = useBackend<Data>();
  const { shipInfo, x, y } = data;
  const locked = useLocked();
  const [editing, setEditing] = useState(false);

  return (
    <Stack align="center">
      <Stack.Item grow>
        {editing ? (
          <Input
            autoFocus
            fluid
            value={shipInfo.name}
            onEnter={(value) => {
              act('rename_ship', { newName: value });
              setEditing(false);
            }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <Button
            fluid
            disabled={locked}
            icon="pen"
            tooltip={locked ? undefined : 'Rename vessel'}
            onClick={() => setEditing(true)}
          >
            {shipInfo.name}
          </Button>
        )}
      </Stack.Item>
      <Stack.Item color="label" ml={1}>
        {shipInfo.class}
        {!!shipInfo.mass && ` · ${shipInfo.mass}t`}
      </Stack.Item>
      <Stack.Item color="label" ml={1}>
        {String(x).padStart(2, '0')} / {String(y).padStart(2, '0')}
      </Stack.Item>
    </Stack>
  );
};

export const ZoneBadge = () => {
  const { data } = useBackend<Data>();
  const {
    zone_name,
    zone_color,
    zone_description,
    weapons_allowed,
    interdiction_allowed,
  } = data;

  return (
    <Tooltip content={zone_description}>
      <Stack align="center" ml={1}>
        <Stack.Item>
          <Icon name="circle" color={zone_color} />
        </Stack.Item>
        <Stack.Item bold color={zone_color}>
          {zone_name}
        </Stack.Item>
        <Stack.Item ml={1}>
          <Tooltip
            content={
              weapons_allowed
                ? 'Ship weapons are live here'
                : 'Ship weapons are disabled here'
            }
          >
            <Box color={weapons_allowed ? 'good' : 'bad'}>Weap</Box>
          </Tooltip>
        </Stack.Item>
        <Stack.Item>
          <Tooltip
            content={
              interdiction_allowed
                ? 'Interdiction and boarding are permitted here'
                : 'Interdiction is prohibited here'
            }
          >
            <Box color={interdiction_allowed ? 'good' : 'bad'}>Intd</Box>
          </Tooltip>
        </Stack.Item>
      </Stack>
    </Tooltip>
  );
};

const ALERT_COLOURS: Record<string, string> = {
  crit: 'bad',
  warn: 'average',
  info: 'label',
};

/**
 * Only conditions that are true right now, ranked critical first. Anything the
 * crew can't act on stays out. This rail is for things that change what you do
 * in the next few seconds.
 */
export const AlertStrip = () => {
  const { data } = useBackend<Data>();
  const contacts = useContacts();
  const drift = useDrift(contacts);
  const alerts: [string, string, string?][] = [];

  if (data.isNotCrew && !data.isAbandoned) {
    alerts.push(['crit', 'Crew authorization required']);
  }
  if (data.distress?.active) {
    const text = data.distress.message ?? '';
    alerts.push([
      'crit',
      `Distress beacon active${
        text ? `, ${text.length > 44 ? `${text.slice(0, 43)}…` : text}` : ''
      }`,
      text,
    ]);
  }
  const incoming = contacts
    .filter((contact) => !!contact.sos)
    .sort((a, b) => a.dist - b.dist)[0];
  if (incoming) {
    alerts.push([
      'warn',
      `Distress call, ${incoming.name} ${incoming.dist} ${incoming.bearing}`.trim(),
      incoming.sosMessage ?? undefined,
    ]);
  }
  if (data.shipDisabled) {
    alerts.push(['crit', 'Hull critical, systems offline']);
  }
  if (data.isInterdicted) {
    alerts.push([
      'crit',
      `Interdicted, engines at ${Math.round(data.speedMultiplier * 100)}%`,
    ]);
  }
  if (data.state === 'flying' && !data.canThrust) {
    alerts.push(['crit', 'No engine power']);
  }
  if (drift?.intercept && drift.intercept.contact.kind === 'hazard') {
    alerts.push([
      drift.intercept.ms <= 15000 ? 'crit' : 'warn',
      `Heading into ${drift.intercept.contact.name}, ${clockOf(drift.intercept.ms)}`,
    ]);
  }
  if (data.zone_advisory) {
    alerts.push([
      data.zone_advisory.critical ? 'crit' : 'warn',
      data.zone_advisory.label,
    ]);
  }
  if (data.zone_transitioning) {
    alerts.push([
      'warn',
      `Entering ${data.zone_transition_target ?? 'new zone'}, ${data.zone_transition_remaining}s`,
    ]);
  }
  if (data.cargoShuttlePresent) {
    alerts.push(['warn', 'Cargo shuttle docked']);
  }
  if (data.calibrating) {
    alerts.push(['warn', 'Bluespace jump calibrating']);
  }
  if (data.autopilot?.engaged) {
    alerts.push([
      'info',
      `Autopilot, ${data.autopilot.label ?? 'selected destination'}${
        data.autopilot.dockOnArrival ? ' · docking on arrival' : ''
      }`,
    ]);
  }
  if (data.hiddenInNebula) {
    alerts.push(['info', 'Nebula concealment active']);
  } else if (data.nebulaHideWarmup) {
    alerts.push([
      'info',
      `Concealing in ${deciToSeconds(data.nebulaHideRemaining)}s`,
    ]);
  } else if (data.onNebula) {
    alerts.push(['info', 'Nebula, concealment available']);
  }

  if (!alerts.length) {
    return (
      <Box color="label" ml={1}>
        All systems nominal
      </Box>
    );
  }

  return (
    <Stack wrap ml={1}>
      {alerts.map(([severity, text, detail]) => (
        <Stack.Item key={text} mr={1}>
          {detail ? (
            <Tooltip content={detail}>
              <Box color={ALERT_COLOURS[severity] ?? 'label'}>{text}</Box>
            </Tooltip>
          ) : (
            <Box color={ALERT_COLOURS[severity] ?? 'label'}>{text}</Box>
          )}
        </Stack.Item>
      ))}
    </Stack>
  );
};

/** 75+ green, 61–74 amber, 51–60 red, 50 and under is the disabled threshold. */
const hullColor = (value: number) => {
  if (value <= 50) return 'bad';
  if (value <= 60) return 'bad';
  if (value <= 74) return 'average';
  return 'good';
};

export const HullGauge = () => {
  const { data } = useBackend<Data>();
  const { integrity, overhealth = 0, shipDisabled } = data;
  const base = Math.min(integrity - overhealth, 100);

  return (
    <LabeledList>
      <LabeledList.Item label="Integrity">
        <ProgressBar
          value={base}
          minValue={0}
          maxValue={100}
          color={hullColor(base)}
        >
          {integrity}%{overhealth > 0 && ` (+${overhealth} plate)`}
        </ProgressBar>
      </LabeledList.Item>
      <LabeledList.Item label="Status">
        <Box color={shipDisabled ? 'bad' : 'label'}>
          {shipDisabled ? 'Disabled' : 'Nominal'}
        </Box>
      </LabeledList.Item>
    </LabeledList>
  );
};

export const FuelStack = () => {
  const { act, data } = useBackend<Data>();
  const { engineInfo = [] } = data;
  const locked = useLocked();

  const live = engineInfo.filter((engine) => engine.enabled && engine.maxFuel);
  const average = live.length
    ? Math.round(
        live.reduce((sum, e) => sum + (e.fuel / e.maxFuel) * 100, 0) /
          live.length,
      )
    : 0;
  const colour = average < 25 ? 'bad' : average < 50 ? 'average' : 'good';

  return (
    <Stack vertical>
      <Stack.Item>
        <ProgressBar value={average} minValue={0} maxValue={100} color={colour}>
          Reserve {average}%
        </ProgressBar>
      </Stack.Item>
      {engineInfo.map((engine) => {
        const percent = engine.maxFuel
          ? Math.round((engine.fuel / engine.maxFuel) * 100)
          : 0;
        const fuelColour = !engine.enabled
          ? 'label'
          : percent < 40
            ? 'average'
            : 'good';
        return (
          <Stack.Item key={engine.ref}>
            <Button.Checkbox
              fluid
              checked={!!engine.enabled}
              disabled={locked}
              tooltip={`${engine.enabled ? 'Shut down' : 'Start'} ${engine.name}`}
              onClick={() => act('toggle_engine', { engine: engine.ref })}
              color="normal"
            >
              {engine.name} ({percent}%)
            </Button.Checkbox>
          </Stack.Item>
        );
      })}
    </Stack>
  );
};

export const DriveGauge = () => {
  const { data } = useBackend<Data>();
  const {
    est_thrust = 0,
    engineInfo = [],
    canThrust,
    burnDirection,
    speedMultiplier,
  } = data;

  const online = engineInfo.filter((engine) => engine.enabled).length;
  const burning = burnDirection !== BURN_NONE && burnDirection !== BURN_STOP;
  const throttled = speedMultiplier < 1;

  return (
    <LabeledList>
      <LabeledList.Item label="Thrust">
        {est_thrust.toFixed(1)}
      </LabeledList.Item>
      <LabeledList.Item label="Drives">
        <Box color={canThrust ? 'good' : 'bad'}>
          {online} / {engineInfo.length} online
        </Box>
      </LabeledList.Item>
      <LabeledList.Item label="State">
        <Box color={canThrust ? 'label' : 'bad'}>
          {!canThrust
            ? 'No engine power'
            : throttled
              ? `Throttled to ${Math.round(speedMultiplier * 100)}%`
              : burning
                ? 'Burning'
                : 'Idle'}
        </Box>
      </LabeledList.Item>
    </LabeledList>
  );
};

export const SensorDial = () => {
  const { act, data } = useBackend<Data>();
  const { sensorRange, scanCooldown, scanCooldownRemaining, state } = data;
  const locked = useLocked();
  const canScan = !locked && state === 'flying';

  return (
    <Stack vertical>
      <Stack.Item>
        <LabeledList>
          <LabeledList.Item label="Range">{sensorRange} tiles</LabeledList.Item>
          <LabeledList.Item label="Status">
            <Box color={scanCooldown ? 'average' : canScan ? 'good' : 'label'}>
              {scanCooldown
                ? `Recharging ${deciToSeconds(scanCooldownRemaining)}s`
                : canScan
                  ? 'Ready'
                  : 'Requires flight'}
            </Box>
          </LabeledList.Item>
        </LabeledList>
      </Stack.Item>
      <Stack.Item>
        <Stack>
          {SCAN_TYPES.map((category) => (
            <Stack.Item key={category}>
              <Button
                disabled={!canScan || !!scanCooldown}
                tooltip={`Chart every ${category.toLowerCase().replace(/s$/, '')} in sensor range so it stays on the map after you leave`}
                onClick={() => act('active_scan', { category })}
              >
                {category}
              </Button>
            </Stack.Item>
          ))}
        </Stack>
      </Stack.Item>
    </Stack>
  );
};
