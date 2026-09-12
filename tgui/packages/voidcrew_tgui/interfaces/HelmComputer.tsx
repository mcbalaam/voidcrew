/**
 * Helm console entry.
 *
 * Thin composition over interfaces/Helm/*: providers own the cross-panel state
 * (selection, chart focus, context menus), the panels read ui_data(), and the
 * chart is drawn on the shared HelmPlane.
 */
import { type MouseEvent, type ReactNode, useRef, useState } from 'react';
import { Button, Section, Stack } from 'tgui-core/components';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import { Chart } from './Helm/Chart';
import { HelmRose, OpsRow, Throttle, VelocityCluster } from './Helm/Controls';
import { Drawer } from './Helm/Drawer';
import type { Data } from './Helm/data';
import {
  ChartFocus,
  clamp,
  contactKey,
  DockMenuControl,
  MENU_SIZE,
  MenuControl,
  Selection,
  useContacts,
} from './Helm/hooks';
import { useManualControl } from './Helm/Keys';
import { ContactMenu, DockPickerMenu } from './Helm/Menu';
import { AbandonedOverlay, CrashOverlay } from './Helm/overlays';
import {
  AlertStrip,
  DriveGauge,
  FuelStack,
  HullGauge,
  Ident,
  SensorDial,
  ZoneBadge,
} from './Helm/Panels';

export const HelmComputer = () => {
  const { data } = useBackend<Data>();
  const { shipCrashed, repairCurrent, repairTotal } = data;
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    key: string | null;
    tile: { x: number; y: number };
    left: number;
    top: number;
  } | null>(null);
  const [dockMenu, setDockMenu] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const contacts = useContacts();
  const menuContact = menu?.key
    ? contacts.find((contact) => contactKey(contact) === menu.key)
    : undefined;
  if (menu?.key && !menuContact) setMenu(null);

  const openMenu = (
    event: MouseEvent,
    key: string | null,
    tile: { x: number; y: number },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const box = rootRef.current?.getBoundingClientRect();
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;
    const cursorX = event.clientX - (box?.left ?? 0);
    const cursorY = event.clientY - (box?.top ?? 0);
    setMenu({
      key,
      tile,
      left:
        cursorX + MENU_SIZE.w <= width
          ? cursorX
          : Math.max(0, cursorX - MENU_SIZE.w),
      top: clamp(cursorY, 0, Math.max(0, height - MENU_SIZE.h)),
    });
  };

  const openDockPicker = (event: MouseEvent) => {
    event.stopPropagation();
    const box = rootRef.current?.getBoundingClientRect();
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;
    const cursorX = event.clientX - (box?.left ?? 0);
    const cursorY = event.clientY - (box?.top ?? 0);
    setDockMenu({
      left:
        cursorX + MENU_SIZE.w <= width
          ? cursorX
          : Math.max(0, cursorX - MENU_SIZE.w),
      top: clamp(cursorY, 0, Math.max(0, height - MENU_SIZE.h)),
    });
  };

  const [selected, setSelected] = useState<string | null>(null);
  const select = (key: string) =>
    setSelected((current) => (current === key ? null : key));
  const [focusRequest, setFocusRequest] = useState<{
    x: number;
    y: number;
    nonce: number;
  } | null>(null);
  const focusOn = (x: number, y: number) =>
    setFocusRequest((current) => ({ x, y, nonce: (current?.nonce ?? 0) + 1 }));

  return (
    <Window width={1216} height={800}>
      <Window.Content fitted>
        <Selection.Provider value={{ selected, select }}>
          <ChartFocus.Provider value={{ request: focusRequest, focusOn }}>
            <MenuControl.Provider value={openMenu}>
              <DockMenuControl.Provider value={openDockPicker}>
                <div
                  ref={rootRef}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                  }}
                  onClick={() => {
                    setMenu(null);
                    setDockMenu(null);
                  }}
                >
                  <Faceplate />
                  {!!menu && (
                    <ContactMenu
                      contact={menuContact}
                      tile={menu.tile}
                      left={menu.left}
                      top={menu.top}
                      onClose={() => setMenu(null)}
                    />
                  )}
                  {!!dockMenu && (
                    <DockPickerMenu
                      left={dockMenu.left}
                      top={dockMenu.top}
                      onClose={() => setDockMenu(null)}
                    />
                  )}
                  {!!shipCrashed && (
                    <CrashOverlay current={repairCurrent} total={repairTotal} />
                  )}
                  {!shipCrashed && <AbandonedOverlay />}
                </div>
              </DockMenuControl.Provider>
            </MenuControl.Provider>
          </ChartFocus.Provider>
        </Selection.Provider>
      </Window.Content>
    </Window>
  );
};

const ManualControlToggle = () => {
  const { manualControl, setManualControl, canManualControl, windowFocused } =
    useManualControl();
  return (
    <Button
      disabled={!canManualControl}
      selected={manualControl}
      color={manualControl ? (windowFocused ? 'good' : 'average') : undefined}
      tooltip={
        !manualControl
          ? 'Steer from the keyboard: WASD and arrows fly, Space brakes, X coasts. Your character stands fast while it is on.'
          : windowFocused
            ? 'Keyboard is steering the ship, click to hand W/A/S/D back to your character'
            : 'Armed, steering resumes when this console window is focused. Right now your keys move your character as normal.'
      }
      onClick={() => setManualControl(!manualControl)}
    >
      {manualControl
        ? windowFocused
          ? 'wasd · live'
          : 'wasd · armed'
        : 'wasd'}
    </Button>
  );
};

const Panel = (props: {
  title?: string;
  children: ReactNode;
  fill?: boolean;
  action?: ReactNode;
}) => (
  <Section
    title={props.title}
    fill={props.fill}
    fitted={!props.title}
    buttons={props.action}
    scrollable={false}
  >
    {props.children}
  </Section>
);

const Faceplate = () => {
  return (
    <Stack fill vertical>
      <Stack.Item>
        <Stack fill>
          <Stack.Item grow={3}>
            <Panel>
              <Ident />
            </Panel>
          </Stack.Item>
          <Stack.Item grow={2}>
            <Panel>
              <ZoneBadge />
            </Panel>
          </Stack.Item>
          <Stack.Item grow={4}>
            <Panel>
              <AlertStrip />
            </Panel>
          </Stack.Item>
        </Stack>
      </Stack.Item>

      <Stack.Item grow>
        <Stack fill>
          <Stack.Item width="15em">
            <Stack vertical fill>
              <Stack.Item grow>
                <Panel title="Hull">
                  <HullGauge />
                </Panel>
              </Stack.Item>
              <Stack.Item grow>
                <Panel title="Fuel">
                  <FuelStack />
                </Panel>
              </Stack.Item>
              <Stack.Item grow>
                <Panel title="Drive">
                  <DriveGauge />
                </Panel>
              </Stack.Item>
              <Stack.Item grow>
                <Panel title="Sensors">
                  <SensorDial />
                </Panel>
              </Stack.Item>
            </Stack>
          </Stack.Item>
          <Stack.Item grow>
            <Section fill>
              <Chart />
            </Section>
          </Stack.Item>
          <Stack.Item width="19em">
            <Panel title="Contacts" fill>
              <Drawer />
            </Panel>
          </Stack.Item>
        </Stack>
      </Stack.Item>

      <Stack.Item>
        <Stack fill>
          <Stack.Item width="7em">
            <Panel title="Throttle">
              <Throttle />
            </Panel>
          </Stack.Item>
          <Stack.Item width="12em">
            <Panel title="Helm" action={<ManualControlToggle />}>
              <HelmRose />
            </Panel>
          </Stack.Item>
          <Stack.Item width="14em">
            <Panel title="Velocity">
              <VelocityCluster />
            </Panel>
          </Stack.Item>
          <Stack.Item grow>
            <Panel title="Operations">
              <OpsRow />
            </Panel>
          </Stack.Item>
        </Stack>
      </Stack.Item>
    </Stack>
  );
};
