/**
 * Contact drawer: the register (with remove/restore and course actions), what
 * shares the ship's tile, the comms log, and sealed-chart intel. Native tgui.
 */
import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Icon,
  Input,
  Stack,
  Tabs,
  Tooltip,
} from 'tgui-core/components';

import { useBackend } from '../../backend';
import { ContactSprite } from './Chart';
import type { Contact, Data } from './data';
import {
  canTravelDock,
  contactKey,
  deciToSeconds,
  useChartFocus,
  useContacts,
  useLocked,
  useMenuControl,
  useSelection,
  useTravelClock,
} from './hooks';
import { contactArt } from './icons';

export const ContactBadge = (props: { contact: Contact }) => {
  const art = contactArt(props.contact);
  return <ContactSprite state={art.state} tint={art.tint} size={16} />;
};

export const Drawer = () => {
  const { data } = useBackend<Data>();
  const { otherInfo = [], transmissions = [] } = data;
  const [tab, setTab] = useState<'Contacts' | 'At location' | 'Comms' | 'Intel'>(
    'Contacts',
  );
  const freshHails = transmissions.filter((hail) => hail.live && !hail.own).length;

  return (
    <Stack vertical fill>
      <Stack.Item>
        <Tabs>
          <Tabs.Tab
            selected={tab === 'Contacts'}
            onClick={() => setTab('Contacts')}
          >
            Contacts
          </Tabs.Tab>
          <Tabs.Tab
            selected={tab === 'At location'}
            onClick={() => setTab('At location')}
          >
            At location
            {!!otherInfo.length && (
              <Box as="span" color="label" ml={0.5}>
                {otherInfo.length}
              </Box>
            )}
          </Tabs.Tab>
          <Tabs.Tab selected={tab === 'Comms'} onClick={() => setTab('Comms')}>
            Comms
            {!!freshHails && (
              <Box as="span" color="label" ml={0.5}>
                {freshHails}
              </Box>
            )}
          </Tabs.Tab>
          <Tabs.Tab selected={tab === 'Intel'} onClick={() => setTab('Intel')}>
            Intel
          </Tabs.Tab>
        </Tabs>
      </Stack.Item>
      <Stack.Item grow>
        <Box style={{ height: '100%', overflowY: 'auto' }}>
          {tab === 'Contacts' && <ContactList />}
          {tab === 'At location' && <AtLocation />}
          {tab === 'Comms' && <Comms />}
          {tab === 'Intel' && <Intel />}
        </Box>
      </Stack.Item>
    </Stack>
  );
};

const ContactList = () => {
  const { act, data } = useBackend<Data>();
  const { dismissedContacts = [] } = data;
  const dismissed = new Set(dismissedContacts);
  const waypoints = useContacts().filter(
    (contact) => !dismissed.has(contact.contactRef),
  );
  const travelClock = useTravelClock();
  const locked = useLocked();
  const { selected, select } = useSelection();
  const { focusOn } = useChartFocus();
  const openActionMenu = useMenuControl();

  const groups: Record<string, Contact[]> = {};
  for (const contact of waypoints) {
    const category = contact.category || 'Waypoints';
    groups[category] ||= [];
    groups[category].push(contact);
  }

  // A nebula bank or asteroid storm is dozens of identically-named tiles. The
  // register lists the nearest one and counts the rest.
  const collapse = (contacts: Contact[]) => {
    const nearest = new Map<
      string,
      { contact: Contact; count: number; refs: string[] }
    >();
    for (const contact of contacts) {
      const groupKey =
        contact.kind === 'nebula' || contact.kind === 'hazard'
          ? contact.name
          : contactKey(contact);
      const existing = nearest.get(groupKey);
      if (!existing) {
        nearest.set(groupKey, {
          contact,
          count: 1,
          refs: [contact.contactRef],
        });
      } else {
        existing.count++;
        existing.refs.push(contact.contactRef);
        if (contact.dist < existing.contact.dist) existing.contact = contact;
      }
    }
    return [...nearest.values()];
  };

  return (
    <Stack vertical>
      {dismissedContacts.length > 0 && (
        <Stack.Item>
          <Stack align="center">
            <Stack.Item grow color="label">
              {dismissedContacts.length} removed
            </Stack.Item>
            <Stack.Item>
              <Button
                disabled={locked}
                tooltip="Restore all contacts removed by this crew"
                onClick={() => act('restore_contacts')}
              >
                Restore all
              </Button>
            </Stack.Item>
          </Stack>
        </Stack.Item>
      )}
      {waypoints.length === 0 && (
        <Stack.Item color="label">No contacts to show</Stack.Item>
      )}
      {Object.keys(groups)
        .sort()
        .map((category) => (
          <Stack.Item key={category}>
            <Box bold color="label">
              {category} · {groups[category].length}
            </Box>
            {collapse(groups[category]).map(({ contact, count, refs }) => {
              const key = contactKey(contact);
              const eta = travelClock(contact.x, contact.y);
              const isSelected = selected === key;
              return (
                <Tooltip
                  key={key}
                  content={
                    contact.sos
                      ? `Distress beacon: "${contact.sosMessage ?? 'no message'}" · right-click to set course`
                      : contact.kind === 'ship' && !contact.identified
                        ? 'Unidentified vessel, right-click for actions'
                        : contact.hazard
                          ? `${contact.hazard} · right-click to set course`
                          : 'Bring it up on the chart · right-click to set course'
                  }
                >
                <Box
                  p={0.5}
                  mt={0.25}
                  backgroundColor={isSelected ? 'rgba(255,255,255,0.08)' : undefined}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    select(key);
                    focusOn(contact.x, contact.y);
                  }}
                  onContextMenu={(event) =>
                    openActionMenu(event, key, { x: contact.x, y: contact.y })
                  }
                >
                  <Stack align="center">
                    <Stack.Item>
                      <ContactBadge contact={contact} />
                    </Stack.Item>
                    <Stack.Item grow color={contact.hostile ? 'bad' : undefined}>
                      {contact.name}
                      {count > 1 && (
                        <Box as="span" color="label">
                          {' '}
                          ×{count}
                        </Box>
                      )}
                    </Stack.Item>
                    <Stack.Item color="label">
                      {contact.dist > 0
                        ? `${contact.dist} ${contact.bearing}`
                        : 'Here'}
                    </Stack.Item>
                    {!locked && (
                      <Stack.Item>
                        <Button
                          icon="trash"
                          tooltip="Remove from contacts; stays on the chart"
                          onClick={(event) => {
                            event.stopPropagation();
                            act('dismiss_contacts', { contacts: refs });
                          }}
                        />
                      </Stack.Item>
                    )}
                  </Stack>
                  <Box color="label" fontSize="0.85em">
                    {String(contact.x).padStart(2, '0')} /{' '}
                    {String(contact.y).padStart(2, '0')}
                    {!!eta && ` · ${eta} out`}
                    {count > 1 && ' · nearest'}
                    {contact.integrity != null && ` · hull ${contact.integrity}%`}
                  </Box>
                  {isSelected && !locked && (
                    <Stack mt={0.5}>
                      {contact.dist > 0 && (
                        <Stack.Item>
                          <Button
                            icon="route"
                            tooltip="Autopilot flies there, avoids hazards"
                            onClick={(event) => {
                              event.stopPropagation();
                              act('autopilot', { x: contact.x, y: contact.y });
                            }}
                          >
                            Set course
                          </Button>
                        </Stack.Item>
                      )}
                      {!!canTravelDock(contact) && (
                        <Stack.Item>
                          <Button
                            icon="anchor"
                            tooltip="Flies there, then begins docking"
                            onClick={(event) => {
                              event.stopPropagation();
                              act('autopilot', {
                                x: contact.x,
                                y: contact.y,
                                dock: 1,
                                target: contact.target,
                              });
                            }}
                          >
                            Travel &amp; dock
                          </Button>
                        </Stack.Item>
                      )}
                    </Stack>
                  )}
                </Box>
                </Tooltip>
              );
            })}
          </Stack.Item>
        ))}
    </Stack>
  );
};

const AtLocation = () => {
  const { act, data } = useBackend<Data>();
  const { otherInfo = [], speed, state } = data;
  const locked = useLocked();
  const canInteract = !locked && !speed && state === 'flying';

  if (!otherInfo.length) {
    return <Box color="label">Nothing at this position</Box>;
  }

  return (
    <Stack vertical>
      {otherInfo.map((object) => (
        <Stack.Item key={object.ref}>
          <Box bold>{object.name}</Box>
          <Box color="label">
            {object.integrity ? `Integrity ${object.integrity}%` : 'Sharing tile'}
          </Box>
          {!!object.hazard && <Box color="label">{object.hazard}</Box>}
          <Button
            fluid
            mt={0.5}
            disabled={!canInteract}
            tooltip={
              canInteract
                ? `Interact with ${object.name}`
                : 'Come to a full stop first'
            }
            onClick={() => act('act_overmap', { ship_to_act: object.ref })}
          >
            Interact
          </Button>
        </Stack.Item>
      ))}
    </Stack>
  );
};

const Comms = () => {
  const { act, data } = useBackend<Data>();
  const { transmissions = [], distress } = data;
  const locked = useLocked();
  const [message, setMessage] = useState('');
  const lastKeySound = useRef(0);

  const send = () => {
    if (!message.trim()) return;
    act('broadcast', { message });
    setMessage('');
  };

  const log = [...transmissions].reverse();

  return (
    <Stack vertical>
      {!!distress?.active && (
        <Stack.Item>
          <Box bold color="bad">
            Distress beacon transmitting
          </Box>
          <Box>{distress.message}</Box>
          <Button
            fluid
            mt={0.5}
            disabled={locked || !!distress.cooldown}
            tooltip={
              distress.cooldown
                ? 'The beacon interlock is still cycling'
                : 'Stop transmitting and drop off every other helm chart'
            }
            onClick={() => act('distress')}
          >
            {distress.cooldown
              ? `Deactivate (${deciToSeconds(distress.cooldownRemaining)}s)`
              : 'Deactivate'}
          </Button>
        </Stack.Item>
      )}
      <Stack.Item>
        <Input
          fluid
          placeholder="Hail vessels in sight…"
          value={message}
          disabled={locked}
          onChange={(value) => {
            setMessage(value);
            const now = Date.now();
            if (now - lastKeySound.current >= 400) {
              lastKeySound.current = now;
              act('typing_sound');
            }
          }}
          onEnter={send}
        />
      </Stack.Item>
      <Stack.Item>
        <Button fluid disabled={locked || !message.trim()} onClick={send}>
          Transmit
        </Button>
      </Stack.Item>
      {log.length === 0 ? (
        <Stack.Item color="label">No traffic heard</Stack.Item>
      ) : (
        <Stack.Item>
          {log.map((hail, index) => (
            <Box
              key={`${hail.sender}-${hail.age}-${index}`}
              mt={0.5}
              color={hail.live ? 'average' : 'label'}
            >
              <Box bold>
                {hail.own ? 'Transmitted' : hail.sender}
                <Box as="span" color="label" ml={1}>
                  {hail.age < 1 ? 'now' : `${hail.age}s ago`}
                </Box>
              </Box>
              <Box>{hail.message}</Box>
              <Box color="label" fontSize="0.85em">
                {String(hail.x).padStart(2, '0')} /{' '}
                {String(hail.y).padStart(2, '0')}
              </Box>
            </Box>
          ))}
        </Stack.Item>
      )}
    </Stack>
  );
};

const Intel = () => {
  const { act, data } = useBackend<Data>();
  const { pendingRumors = [] } = data;
  const locked = useLocked();

  if (!pendingRumors.length) {
    return <Box color="label">No sealed charts aboard</Box>;
  }

  return (
    <Stack vertical>
      {pendingRumors.map((rumor) => (
        <Stack.Item key={rumor.ref}>
          <Box bold color="average">
            <Icon name="scroll" mr={1} />
            {rumor.name}
          </Box>
          {!!rumor.desc && <Box color="label">{rumor.desc}</Box>}
          <Button
            fluid
            mt={0.5}
            disabled={locked}
            tooltip="Spawns the signal in the deep lanes and charts it. The mark is visible to anyone who scans for it, ready the crew first."
            onClick={() => act('reveal_rumor', { chart: rumor.ref })}
          >
            Reveal coordinates
          </Button>
        </Stack.Item>
      ))}
    </Stack>
  );
};
