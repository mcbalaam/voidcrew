/** Right-click action menu and the Dock option picker, native tgui, console-rooted. */
import { Box, Button } from 'tgui-core/components';

import { useBackend } from '../../backend';
import type { Contact, Data } from './data';
import { canTravelDock, useLocked } from './hooks';

export const ContactMenu = (props: {
  contact?: Contact;
  tile: { x: number; y: number };
  left: number;
  top: number;
  onClose: () => void;
}) => {
  const { contact, tile, left, top, onClose } = props;
  const { act, data } = useBackend<Data>();
  const { scanCooldown, state, autopilot, x, y, shipDisabled, canThrust } = data;
  const locked = useLocked();

  const unknown = contact?.kind === 'ship' && !contact.identified;
  const here = tile.x === x && tile.y === y;
  const items: {
    label: string;
    tooltip?: string;
    disabled?: boolean;
    onClick: () => void;
  }[] = [];

  if (unknown) {
    items.push({
      label: 'Identify vessels',
      tooltip: scanCooldown
        ? 'Sensors recharging'
        : state !== 'flying'
          ? 'Requires flight'
          : undefined,
      disabled: locked || !!scanCooldown || state !== 'flying',
      onClick: () => act('active_scan', { category: 'Ships' }),
    });
  }

  if (contact?.dist === 0 && contact.target) {
    items.push({
      label: 'Interact',
      tooltip: 'Shares our position',
      disabled: locked,
      onClick: () => act('act_overmap', { ship_to_act: contact.target }),
    });
  }

  const blocked =
    state !== 'flying'
      ? 'Requires flight'
      : shipDisabled
        ? 'Systems offline'
        : !canThrust
          ? 'No engine power'
          : undefined;

  if (!here) {
    items.push({
      label: contact ? `Set course · ${contact.name}` : 'Set course here',
      tooltip: blocked ?? 'Avoids hazards in allowed zones',
      disabled: locked || !!blocked,
      onClick: () => act('autopilot', { x: tile.x, y: tile.y }),
    });
  }

  if (contact && canTravelDock(contact)) {
    items.push({
      label: `Travel & dock · ${contact.name}`,
      tooltip: blocked ?? 'Flies there, then begins docking',
      disabled: locked || !!blocked,
      onClick: () =>
        act('autopilot', {
          x: tile.x,
          y: tile.y,
          dock: 1,
          target: contact.target,
        }),
    });
  }

  if (autopilot?.engaged) {
    items.push({
      label: 'Cancel autopilot',
      disabled: locked,
      onClick: () => act('autopilot_cancel'),
    });
  }

  if (contact?.ref) {
    items.push({
      label: 'Clear waypoint',
      disabled: locked,
      onClick: () => act('remove_waypoint', { waypoint: contact.ref }),
    });
  }

  if (contact) {
    const dismissed = data.dismissedContacts?.includes(contact.contactRef);
    items.push({
      label: dismissed ? 'Restore to contacts' : 'Remove from contacts',
      tooltip: 'Shared by the crew; stays on the chart',
      disabled: locked,
      onClick: () =>
        act(dismissed ? 'restore_contacts' : 'dismiss_contacts', {
          contacts: [contact.contactRef],
        }),
    });
  }

  return (
    <Box
      position="absolute"
      left={`${left}px`}
      top={`${top}px`}
      width="16em"
      backgroundColor="black"
      style={{ zIndex: 100, border: '1px solid rgba(255,255,255,0.2)' }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <Box bold p={0.5} backgroundColor="rgba(255,255,255,0.1)">
        {contact?.name ??
          `${String(tile.x).padStart(2, '0')} / ${String(tile.y).padStart(2, '0')}`}
      </Box>
      {items.length === 0 ? (
        <Box p={0.5} color="label">
          No actions available
        </Box>
      ) : (
        items.map((item) => (
          <Button
            key={item.label}
            fluid
            disabled={item.disabled}
            tooltip={item.tooltip}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </Button>
        ))
      )}
    </Box>
  );
};

export const DockPickerMenu = (props: {
  left: number;
  top: number;
  onClose: () => void;
}) => {
  const { left, top, onClose } = props;
  const { act, data } = useBackend<Data>();
  const options = data.dockOptions ?? [];

  return (
    <Box
      position="absolute"
      left={`${left}px`}
      top={`${top}px`}
      width="16em"
      backgroundColor="black"
      style={{ zIndex: 100, border: '1px solid rgba(255,255,255,0.2)' }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <Box bold p={0.5} backgroundColor="rgba(255,255,255,0.1)">
        Dock with…
      </Box>
      {options.length === 0 ? (
        <Box p={0.5} color="label">
          Nothing to dock with
        </Box>
      ) : (
        options.map((option) => (
          <Button
            key={option.ref ?? 'empty'}
            fluid
            onClick={() => {
              act('dock', option.ref ? { target: option.ref } : {});
              onClose();
            }}
          >
            {option.name}
          </Button>
        ))
      )}
    </Box>
  );
};
