import { useMemo } from "react";
import type { CSSProperties } from "react";
import { getMockupStateSpec } from "../../engine/mockupStateBank";
import { useAppStore } from "../../store/useAppStore";

const streamPaths = [
  "M-80 730 C180 600 260 790 450 600 C660 388 800 210 1120 162 C1290 138 1440 180 1580 78",
  "M-100 660 C145 520 355 560 510 398 C710 188 935 102 1220 118 C1395 128 1510 94 1640 20",
  "M210 820 C315 610 430 535 610 520 C805 505 930 650 1140 548 C1320 460 1415 325 1620 355",
  "M148 124 C332 210 438 190 580 318 C740 462 945 412 1115 292 C1266 186 1432 205 1600 132",
  "M245 378 C445 208 610 188 810 306 C1000 420 1114 566 1382 506 C1500 478 1584 526 1660 646",
  "M392 690 C535 505 690 610 770 424 C855 228 1045 218 1170 338 C1310 470 1420 400 1610 492",
  "M-60 510 C150 450 278 328 500 365 C680 395 790 525 980 438 C1160 355 1300 168 1600 230",
  "M70 820 C360 705 460 845 682 672 C890 510 1040 650 1278 575 C1430 526 1518 600 1652 760",
  "M-160 850 C95 720 210 655 390 706 C625 772 690 600 842 472 C1055 292 1300 348 1680 188",
  "M-180 790 C20 702 192 845 382 732 C588 610 712 720 870 562 C1050 382 1280 580 1660 438",
  "M175 920 C292 720 438 780 570 618 C725 426 844 382 1035 436 C1240 492 1360 705 1660 664",
  "M-130 265 C108 354 285 246 470 312 C662 380 755 514 915 428 C1114 321 1290 118 1630 180",
  "M270 70 C454 220 590 132 735 254 C880 378 1004 300 1188 252 C1370 205 1478 285 1626 244",
  "M-90 430 C118 540 340 482 510 530 C704 584 850 742 1050 610 C1242 482 1372 355 1640 392",
  "M-140 586 C130 410 286 490 515 362 C720 246 882 118 1106 204 C1305 280 1436 244 1650 96",
  "M55 108 C250 242 365 320 560 276 C728 238 900 70 1098 128 C1284 182 1438 134 1600 52",
  "M80 560 C260 470 390 500 545 405 C700 308 760 222 905 278 C1065 340 1145 458 1345 392 C1458 355 1535 388 1640 458",
  "M-120 350 C70 410 225 360 412 300 C625 230 765 140 960 176 C1175 216 1240 365 1420 300 C1530 260 1602 286 1705 335",
  "M205 175 C390 290 504 250 655 365 C815 488 936 470 1090 380 C1258 282 1390 338 1580 250",
  "M102 710 C270 650 375 600 538 650 C752 716 844 570 986 482 C1165 372 1320 422 1590 342",
  "M315 854 C492 742 610 812 750 676 C912 520 1008 582 1160 500 C1318 416 1450 438 1665 336",
  "M-80 210 C120 192 250 258 424 226 C612 190 760 40 934 98 C1135 164 1256 82 1438 124 C1558 152 1610 114 1680 92",
  "M112 430 C285 278 424 348 570 258 C740 152 910 216 1052 330 C1200 448 1360 378 1605 522",
  "M-140 805 C88 610 248 690 430 540 C625 380 760 468 890 338 C1040 188 1225 238 1508 112",
  "M-20 612 C200 728 385 462 582 560 C728 632 810 786 1005 668 C1210 545 1328 690 1655 608",
  "M422 56 C560 170 674 80 812 178 C958 282 1040 202 1188 176 C1350 148 1452 214 1602 188",
  "M-155 500 C12 590 185 508 360 585 C560 672 706 522 878 612 C1090 722 1254 548 1635 738",
];

const constellationDots = [
  [36, 68],
  [52, 31],
  [58, 43],
  [43, 36],
  [69, 25],
  [74, 53],
  [83, 21],
  [88, 62],
  [29, 42],
  [21, 72],
  [62, 76],
  [48, 56],
  [34, 33],
  [39, 48],
  [46, 28],
  [55, 64],
  [67, 39],
  [77, 67],
  [82, 46],
  [91, 31],
  [18, 58],
  [23, 50],
  [31, 77],
  [72, 15],
  [12, 82],
  [94, 72],
  [44, 78],
  [57, 20],
  [64, 52],
  [88, 18],
  [27, 24],
  [37, 61],
  [53, 39],
  [60, 48],
  [74, 72],
  [86, 55],
  [95, 42],
  [16, 31],
  [24, 67],
  [49, 16],
  [69, 59],
  [79, 26],
];

const panelZones = [
  { id: "core", label: "CORE", x: 41.2, y: 24.5, w: 21.4, h: 27.8 },
  { id: "system", label: "SYSTEM", x: 14.5, y: 8.5, w: 20.8, h: 21 },
  { id: "project", label: "PROJECT", x: 13.2, y: 31.5, w: 20.5, h: 20.5 },
  { id: "insights", label: "SIGNALS", x: 12.4, y: 54.2, w: 17.8, h: 22.8 },
  { id: "agents", label: "AGENTS", x: 32.8, y: 11.5, w: 41.5, h: 48 },
  { id: "model", label: "MODEL", x: 61.5, y: 7.8, w: 19.6, h: 20.8 },
  { id: "stream", label: "STREAM", x: 80.3, y: 7.5, w: 18.6, h: 21.6 },
  { id: "pipeline", label: "PIPELINE", x: 67, y: 30.2, w: 22.2, h: 22.7 },
  { id: "activity", label: "ACTIVITY", x: 86.2, y: 30.4, w: 13.2, h: 30.5 },
  { id: "suggestions", label: "ACTIONS", x: 80.6, y: 60.5, w: 18.7, h: 17.5 },
  { id: "causality", label: "CAUSALITY", x: 28.3, y: 53.4, w: 39.2, h: 17.8 },
  { id: "timeline", label: "TIMELINE", x: 27.3, y: 73.8, w: 50.5, h: 7.4 },
  { id: "chat", label: "COMMAND", x: 15.7, y: 80, w: 68.8, h: 17 },
  { id: "canvas", label: "CANVAS", x: 21.6, y: 15.2, w: 59.5, h: 57 },
];

export function FlowFieldOverlay() {
  const mode = useAppStore((s) => s.mode);
  const activeCausalPath = useAppStore((s) => s.activeCausalPath);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const mockupSpec = useMemo(() => getMockupStateSpec(activeMockupStateId), [activeMockupStateId]);

  const className = useMemo(() => {
    const active = activeCausalPath ? " flow-field--causal" : "";
    return `flow-field flow-field--${mode} flow-field--theme-${mockupSpec.theme}${active}`;
  }, [mode, activeCausalPath, mockupSpec.theme]);

  const activeFocus = useMemo(() => {
    return new Set(mockupSpec.focus);
  }, [mockupSpec.focus]);

  const globalActive = activeFocus.has("global");

  return (
    <div className={className} aria-hidden="true">
      <svg className="flow-field__svg" viewBox="0 0 1600 900" preserveAspectRatio="none">
        <defs>
          <linearGradient id="flow-cyan-magenta" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="var(--flow-primary)" stopOpacity="0" />
            <stop offset="28%" stopColor="var(--flow-primary)" stopOpacity="0.86" />
            <stop offset="56%" stopColor="var(--flow-secondary)" stopOpacity="0.74" />
            <stop offset="78%" stopColor="var(--flow-tertiary)" stopOpacity="0.72" />
            <stop offset="100%" stopColor="var(--flow-primary)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="flow-warm" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="var(--flow-warm)" stopOpacity="0" />
            <stop offset="35%" stopColor="var(--flow-warm)" stopOpacity="0.72" />
            <stop offset="72%" stopColor="var(--flow-danger)" stopOpacity="0.68" />
            <stop offset="100%" stopColor="var(--flow-primary)" stopOpacity="0" />
          </linearGradient>
          <filter id="flow-glow" x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="4.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {streamPaths.map((path, index) => (
          <g key={path} className={`flow-field__stream flow-field__stream--${index % 4}`}>
            <path className="flow-field__ribbon" d={path} />
            <path className="flow-field__thread" d={path} />
            <path className="flow-field__spark-trace" d={path} />
          </g>
        ))}

        <g className="flow-field__panel-routes">
          <path d="M455 178 C560 230 642 282 770 330 C896 380 1000 312 1138 205" />
          <path d="M340 390 C485 355 615 345 760 382 C930 426 1010 490 1190 410" />
          <path d="M292 620 C472 604 630 570 782 520 C948 465 1122 475 1390 438" />
          <path d="M468 665 C590 620 710 580 825 528 C942 474 1050 535 1198 642" />
          <path d="M570 290 C645 350 715 385 810 392 C930 400 1030 335 1168 260" />
          <path d="M400 754 C565 725 690 725 820 690 C1000 640 1120 682 1350 652" />
        </g>
      </svg>

      {constellationDots.map(([left, top], index) => (
        <span
          key={`${left}-${top}`}
          className={`flow-field__dot flow-field__dot--${index % 4}`}
          style={{ left: `${left}%`, top: `${top}%` }}
        />
      ))}

      <div className="flow-field__panel-zones">
        {panelZones.map((zone) => (
          <span
            key={zone.id}
            className={`flow-field__panel-zone ${
              globalActive || activeFocus.has(zone.id) ? "is-active" : ""
            }`}
            style={
              {
                "--zone-x": `${zone.x}%`,
                "--zone-y": `${zone.y}%`,
                "--zone-w": `${zone.w}%`,
                "--zone-h": `${zone.h}%`,
              } as CSSProperties
            }
          >
            <b>{zone.label}</b>
          </span>
        ))}
      </div>

      <div className="flow-field__orbital-shells">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} style={{ "--shell-index": index } as CSSProperties} />
        ))}
      </div>

      <div className="flow-field__core-glow" />
      <div className="flow-field__core-star">
        {Array.from({ length: 34 }, (_, index) => (
          <span key={index} style={{ "--ray-index": index } as CSSProperties} />
        ))}
      </div>
      <div className="flow-field__core-knot-map">
        {Array.from({ length: 20 }, (_, index) => (
          <i key={index} style={{ "--knot-index": index } as CSSProperties} />
        ))}
      </div>
      <div className="flow-field__lower-river" />
      <div className="flow-field__brain">
        <span className="flow-field__brain-ring flow-field__brain-ring--outer" />
        <span className="flow-field__brain-ring flow-field__brain-ring--middle" />
        <span className="flow-field__brain-ring flow-field__brain-ring--inner" />
        <span className="flow-field__brain-core" />
        {Array.from({ length: 14 }, (_, index) => (
          <i key={index} style={{ "--node-index": index } as CSSProperties} />
        ))}
      </div>
      <div className="flow-field__vortex">
        {Array.from({ length: 28 }, (_, index) => (
          <span key={index} style={{ "--ray-index": index } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
