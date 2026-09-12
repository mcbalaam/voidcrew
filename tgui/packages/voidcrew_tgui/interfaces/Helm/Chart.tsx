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
import { Blink, Box, Button, DmIcon, Icon } from 'tgui-core/components';

import { HelmPlane } from '../../../tgui/interfaces/common/HelmPlane';
import { useBackend } from '../../backend';
import { type Contact, type Data, DIR_VECTOR } from './data';
import {
  contactKey,
  isChartTile,
  useChartFocus,
  useContacts,
  useDrift,
  useMenuControl,
  useSelection,
  visibleCourseSegments,
} from './hooks';
import { CONTACT_TINTS, contactArt, OVERMAP_DMI } from './icons';

/** Map-space pixels per overmap tile. */
const TILE = 26;
/** How far around the ship wrapped contact copies are drawn, in tiles. */
const WRAP_MARGIN = 8;

const SHIP_TINT = '#e0a72c';

/** 0 = up (north), clockwise. Flip to compare a rotating token against a fixed sprite. */
const ROTATE_SHIP_BY_COURSE = false;

const courseAngle = (dir: number) => {
  const vector = DIR_VECTOR[dir];
  if (!vector) return 0;
  return (Math.atan2(vector[0], vector[1]) * 180) / Math.PI;
};

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

  // The reference map is fetched asynchronously; until it lands there is no
  // sprite URL to build, so contacts fall back to plain marks.
  const iconRefReady = !!(globalThis as any).Byond?.iconRefMap?.[OVERMAP_DMI];

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
  const shipCourse = data.commandedCourse || data.driftDirection || 0;
  const focus = focusRequest
    ? {
        x: toX(focusRequest.x),
        y: toY(focusRequest.y),
        nonce: focusRequest.nonce,
      }
    : selfFocus;

  // The base copy is always drawn; wrapped copies are added only while the
  // contact sits near the seam, so a charted contact on the far side isn't lost.
  const copiesOf = (tileX: number, tileY: number) => {
    const out: { x: number; y: number }[] = [{ x: tileX, y: tileY }];
    for (const ox of [-size, size]) {
      for (const oy of [-size, size]) {
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
          {iconRefReady ? (
            <ContactSprite state={art.state} tint={art.tint} />
          ) : (
            // Until the icon reference map has loaded there is no sprite to draw;
            // a plain coloured mark keeps contacts visible rather than blank.
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: art.tint ?? CONTACT_TINTS.neutral,
              }}
            />
          )}
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

        {((drift && drift.tiles.length > 0) ||
          (autopilot?.path?.length ?? 0) > 0) && (
          <HelmPlane.Button x={0} y={0} anchor="top-left" zIndex={0}>
            <svg
              width={mapPx}
              height={mapPx}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              {drift && drift.tiles.length > 0 && (
                <polyline
                  points={[
                    shipPx,
                    ...drift.tiles.map((tile) => ({
                      x: toX(tile.x),
                      y: toY(tile.y),
                    })),
                  ]
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                  fill="none"
                  stroke={SHIP_TINT}
                  strokeOpacity={0.6}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}
              {(autopilot?.path?.length ?? 0) > 0 &&
                visibleCourseSegments(
                  [x, y],
                  autopilot?.path ?? [],
                  [x, y],
                  size,
                ).map((segment, index) => (
                    <line
                      key={`route-${index}`}
                      x1={toX(segment.from[0])}
                      y1={toY(segment.from[1])}
                      x2={toX(segment.to[0])}
                      y2={toY(segment.to[1])}
                      stroke="#59b871"
                      strokeWidth={2}
                    />
                  ),
                )}
            </svg>
          </HelmPlane.Button>
        )}
        {!!drift?.hold && (
          <HelmPlane.Button
            x={toX(drift.hold.x)}
            y={toY(drift.hold.y)}
            zIndex={2}
            keepScale
          >
            <Icon name="ban" color="bad" />
          </HelmPlane.Button>
        )}

        {autopilot?.destX != null && autopilot?.destY != null && (
          <HelmPlane.Button
            x={toX(autopilot.destX)}
            y={toY(autopilot.destY)}
            zIndex={2}
            keepScale
          >
            <Icon name="location-arrow" color="good" />
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
              transform: ROTATE_SHIP_BY_COURSE
                ? `rotate(${courseAngle(shipCourse)}deg)`
                : undefined,
            }}
          >
            {iconRefReady ? (
              <ContactSprite state="ship" tint={SHIP_TINT} size={24} />
            ) : (
              <Icon name="location-arrow" color="good" />
            )}
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
