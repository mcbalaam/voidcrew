/**
 * Helm navigation chart, drawn on HelmPlane.
 *
 * The world is a `chart.size`-tile square that wraps on both axes. Coordinates
 * come from the server; this file only maps them to map-space pixels (tile * TILE,
 * y inverted so north is up) and drops nodes onto the plane. The camera and all
 * pan/zoom live in HelmPlane; the contact register aims it through the `focus`
 * prop.
 */
import { Fragment, type CSSProperties, useState } from 'react';
import { Blink, Box, Button, DmIcon } from 'tgui-core/components';

import { HelmPlane } from '../../../tgui/interfaces/common/HelmPlane';
import { useBackend } from '../../backend';
import type { Contact, Data } from './data';
import {
  contactKey,
  isChartTile,
  useChartFocus,
  useContacts,
  useDrift,
  useMenuControl,
  useSelection,
} from './hooks';
import { contactArt, OVERMAP_DMI } from './icons';

/** Map-space pixels per overmap tile. */
const TILE = 26;
/** How far around the ship wrapped contact copies are drawn, in tiles. */
const WRAP_MARGIN = 8;

const SHIP_TINT = '#e0a72c';

/** A world DMI sprite, optionally recoloured by masking its alpha. */
export const ContactSprite = (props: {
  state: string;
  tint?: string | null;
  size?: number;
  direction?: number;
}) => {
  const { state, tint, size = 22, direction = 2 } = props;
  const ref = (globalThis as any).Byond?.iconRefMap?.[OVERMAP_DMI] as
    | string
    | undefined;
  const pixelated: CSSProperties = { imageRendering: 'pixelated' };

  if (!tint || !ref) {
    return (
      <DmIcon
        icon={OVERMAP_DMI}
        icon_state={state}
        direction={direction}
        width={`${size}px`}
        height={`${size}px`}
        style={pixelated}
      />
    );
  }

  const url = `${ref}?state=${state}&dir=${direction}&movement=false&frame=1`;
  const mask: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: tint,
    WebkitMaskImage: `url("${url}")`,
    WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskImage: `url("${url}")`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
  };
  return <div style={mask} />;
};

export const Chart = () => {
  const { data } = useBackend<Data>();
  const { x, y, chart, sensorRange, transmissions = [], autopilot } = data;

  const size = chart?.size ?? 51;
  const centre = chart?.centre ?? (size - 1) / 2;
  const maxRadius = (size - 1) / 2;
  const viewRange = chart?.viewRange ?? 4;
  const mapPx = size * TILE;

  const contacts = useContacts();
  const drift = useDrift(contacts);
  const { selected, select } = useSelection();
  const openMenu = useMenuControl();
  const { request: focusRequest } = useChartFocus();

  const [hovered, setHovered] = useState<string | null>(null);
  // Recentre is opt-in: the plane must never yank itself back to the ship while
  // the crew is looking somewhere else, so following is a button, not a mode.
  const [selfFocus, setSelfFocus] = useState<{
    x: number;
    y: number;
    nonce: number;
  } | null>(null);

  const toX = (tileX: number) => tileX * TILE;
  const toY = (tileY: number) => (size - tileY) * TILE;
  const toTile = (px: number, py: number) => ({
    x: Math.round(px / TILE),
    y: Math.round(size - py / TILE),
  });

  const shipPx = { x: toX(x), y: toY(y) };
  const focus = focusRequest
    ? {
        x: toX(focusRequest.x),
        y: toY(focusRequest.y),
        nonce: focusRequest.nonce,
      }
    : selfFocus;

  // Wrapped copies: a contact across the seam is also drawn on this side while
  // it is inside the drawing window, so a ship near an edge sees both sides.
  const copiesOf = (tileX: number, tileY: number) => {
    const out: { x: number; y: number }[] = [];
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const cx = tileX + ox;
        const cy = tileY + oy;
        if (
          Math.abs(cx - x) <= WRAP_MARGIN + viewRange &&
          Math.abs(cy - y) <= WRAP_MARGIN + viewRange
        ) {
          out.push({ x: cx, y: cy });
        }
      }
    }
    return out;
  };

  const ringStyle = (radiusTiles: number, colour: string): CSSProperties => {
    const d = radiusTiles * 2 * TILE;
    return {
      width: `${d}px`,
      height: `${d}px`,
      borderRadius: '50%',
      border: `1px dashed ${colour}`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    };
  };

  const contactNode = (contact: Contact, px: number, py: number, key: string) => {
    const art = contactArt(contact);
    const keyRef = contactKey(contact);
    const isSelected = selected === keyRef;
    return (
      <HelmPlane.Button
        key={key}
        x={px}
        y={py}
        keepScale
        selected={isSelected}
        tooltip={contact.name}
        onClick={() => select(keyRef)}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu(event, keyRef, { x: contact.x, y: contact.y });
        }}
      >
        <div
          onMouseEnter={() => setHovered(keyRef)}
          onMouseLeave={() => setHovered((cur) => (cur === keyRef ? null : cur))}
          style={{ display: 'flex', transform: `scale(${art.scale})` }}
        >
          <ContactSprite state={art.state} tint={art.tint} />
        </div>
      </HelmPlane.Button>
    );
  };

  const hoveredContact = hovered
    ? contacts.find((entry) => contactKey(entry) === hovered)
    : undefined;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      <HelmPlane
        mapWidth={mapPx}
        mapHeight={mapPx}
        maxScale={3}
        focus={focus}
        minimap
        stageBackground={
          <div style={{ position: 'absolute', inset: 0, background: '#0d1018' }} />
        }
        background={
          <div
            style={{ position: 'absolute', inset: 0 }}
            onContextMenu={(event) => {
              event.preventDefault();
              const native = event.nativeEvent;
              openMenu(event, null, toTile(native.offsetX, native.offsetY));
            }}
          >
            <svg
              width={mapPx}
              height={mapPx}
              style={{ position: 'absolute', inset: 0 }}
            >
              <circle
                cx={toX(centre)}
                cy={toY(centre)}
                r={maxRadius * TILE}
                fill="rgba(207, 74, 56, 0.05)"
              />
              <circle
                cx={toX(centre)}
                cy={toY(centre)}
                r={maxRadius * (chart?.ringMiddle ?? 0.66) * TILE}
                fill="rgba(217, 162, 48, 0.05)"
              />
              <circle
                cx={toX(centre)}
                cy={toY(centre)}
                r={maxRadius * (chart?.ringInner ?? 0.33) * TILE}
                fill="rgba(89, 184, 113, 0.06)"
              />
              {[1, 0.66, 0.33].map((ratio) => (
                <circle
                  key={ratio}
                  cx={toX(centre)}
                  cy={toY(centre)}
                  r={maxRadius * ratio * TILE}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.18)"
                  strokeDasharray="4 6"
                />
              ))}
              {Array.from({ length: size + 1 }, (_, i) => (
                <Fragment key={i}>
                  <line
                    x1={i * TILE}
                    y1={0}
                    x2={i * TILE}
                    y2={mapPx}
                    stroke="rgba(255, 255, 255, 0.05)"
                  />
                  <line
                    x1={0}
                    y1={i * TILE}
                    x2={mapPx}
                    y2={i * TILE}
                    stroke="rgba(255, 255, 255, 0.05)"
                  />
                </Fragment>
              ))}
              <circle
                cx={toX(centre)}
                cy={toY(centre)}
                r={TILE * 1.4}
                fill={SHIP_TINT}
                opacity={0.9}
              />
            </svg>
          </div>
        }
      >
        <HelmPlane.Button x={shipPx.x} y={shipPx.y} zIndex={1}>
          <div style={ringStyle(viewRange, 'rgba(255,255,255,0.25)')} />
        </HelmPlane.Button>
        <HelmPlane.Button x={shipPx.x} y={shipPx.y} zIndex={1}>
          <div
            style={ringStyle(sensorRange ?? viewRange, 'rgba(89,184,113,0.35)')}
          />
        </HelmPlane.Button>

        {contacts.flatMap((contact) =>
          copiesOf(contact.x, contact.y)
            .filter(({ x: cx, y: cy }) => isChartTile(cx, cy, size))
            .map((copy, index) =>
              contactNode(
                contact,
                toX(copy.x),
                toY(copy.y),
                `${contactKey(contact)}#${index}`,
              ),
            ),
        )}

        {drift?.tiles.map((tile) => (
          <HelmPlane.Button
            key={`drift-${tile.step}`}
            x={toX(tile.x)}
            y={toY(tile.y)}
            zIndex={0}
          >
            <div
              style={{
                width: `${TILE * 0.3}px`,
                height: `${TILE * 0.3}px`,
                background: 'rgba(224,167,44,0.5)',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </HelmPlane.Button>
        ))}
        {!!drift?.hold && (
          <HelmPlane.Button
            x={toX(drift.hold.x)}
            y={toY(drift.hold.y)}
            zIndex={2}
            keepScale
          >
            <div
              style={{
                color: '#cf4a38',
                fontSize: '14px',
                fontWeight: 'bold',
                transform: 'translate(-50%, -50%)',
              }}
            >
              ▣
            </div>
          </HelmPlane.Button>
        )}

        {autopilot?.path?.map((node, index) => (
          <HelmPlane.Button
            key={`route-${index}`}
            x={toX(node[0])}
            y={toY(node[1])}
            zIndex={2}
          >
            <div
              style={{
                width: `${TILE * 0.28}px`,
                height: `${TILE * 0.28}px`,
                borderRadius: '50%',
                background: '#59b871',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </HelmPlane.Button>
        ))}
        {autopilot?.destX != null && autopilot?.destY != null && (
          <HelmPlane.Button
            x={toX(autopilot.destX)}
            y={toY(autopilot.destY)}
            zIndex={2}
            keepScale
          >
            <div
              style={{
                color: '#59b871',
                fontSize: '18px',
                transform: 'translate(-50%, -50%)',
              }}
            >
              ⌖
            </div>
          </HelmPlane.Button>
        )}

        {transmissions.map((signal, index) => (
          <HelmPlane.Button
            key={`tx-${index}`}
            x={toX(signal.x)}
            y={toY(signal.y)}
            keepScale
            zIndex={3}
          >
            {signal.live ? (
              <Blink>
                <ContactSprite
                  state="event"
                  tint={signal.own ? SHIP_TINT : '#8c9ea2'}
                  size={14}
                />
              </Blink>
            ) : null}
          </HelmPlane.Button>
        ))}

        <HelmPlane.Button
          id="helm-ship"
          x={shipPx.x}
          y={shipPx.y}
          keepScale
          zIndex={5}
        >
          <div
            style={{
              color: SHIP_TINT,
              fontSize: '24px',
              transform: 'translate(-50%, -50%)',
            }}
          >
            ▲
          </div>
        </HelmPlane.Button>
      </HelmPlane>
      <Box position="absolute" top="0.5em" right="0.5em" style={{ zIndex: 10 }}>
        <Button
          icon="crosshairs"
          tooltip="Recentre on the ship"
          onClick={() =>
            setSelfFocus({
              x: toX(x),
              y: toY(y),
              nonce: (selfFocus?.nonce ?? 0) + 1,
            })
          }
        />
      </Box>
      {!!hoveredContact && (
        <Box
          position="absolute"
          bottom="0.5em"
          left="0.5em"
          backgroundColor="black"
          style={{ pointerEvents: 'none' }}
          px={0.5}
        >
          <b>{hoveredContact.name}</b> · {hoveredContact.dist}{' '}
          {hoveredContact.bearing}
        </Box>
      )}
    </div>
  );
};
