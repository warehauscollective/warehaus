'use client';

import { useState } from 'react';
import { ChevronUp, Eye, Users, Target, Sparkles, TrendingUp, Palette, Droplets, Type, LayoutGrid, Layers, Code2, Database, Cable, Shield, Rocket } from 'lucide-react';
import { useLayout, type ActiveTab } from '@/components/providers/LayoutProvider';
import type { LucideIcon } from 'lucide-react';
import { Eyebrow, Mono } from '@/components/react/ui/typography';

/* ───────── Types ───────── */
interface SkillNode {
  id: string;
  label: string;
  icon: LucideIcon;
  collected: boolean;
  /** Position as percentage of container */
  x: number;
  y: number;
}

interface SkillTree {
  tab: ActiveTab;
  label: string;
  color: string;
  glowColor: string;
  hexColor: string;
  nodes: SkillNode[];
  /** Connections as pairs of node indices */
  edges: [number, number][];
}

/* ───────── Data ───────── */
const SKILL_TREES: SkillTree[] = [
  {
    tab: 'dream',
    label: 'Dream',
    color: 'text-dream',
    glowColor: 'rgba(var(--dream-glow),',
    hexColor: 'var(--dream-primary)',
    nodes: [
      { id: 'd-vision',   label: 'Vision Statement', icon: Eye,        collected: false, x: 16, y: 30 },
      { id: 'd-audience',  label: 'Target Audience',  icon: Users,      collected: false, x: 8,  y: 52 },
      { id: 'd-problem',   label: 'Core Problem',     icon: Target,     collected: false, x: 22, y: 55 },
      { id: 'd-features',  label: 'Key Features',     icon: Sparkles,   collected: false, x: 12, y: 76 },
      { id: 'd-metrics',   label: 'Success Metrics',  icon: TrendingUp, collected: false, x: 26, y: 78 },
    ],
    edges: [[0, 1], [0, 2], [1, 3], [2, 4], [1, 2], [3, 4]],
  },
  {
    tab: 'design',
    label: 'Design',
    color: 'text-design',
    glowColor: 'rgba(var(--design-glow),',
    hexColor: 'var(--design-primary)',
    nodes: [
      { id: 's-brand',    label: 'Brand Identity',    icon: Palette,    collected: false, x: 50, y: 24 },
      { id: 's-color',     label: 'Color Palette',     icon: Droplets,   collected: false, x: 38, y: 42 },
      { id: 's-type',      label: 'Typography',        icon: Type,       collected: false, x: 62, y: 42 },
      { id: 's-layout',    label: 'Layout System',     icon: LayoutGrid, collected: false, x: 42, y: 65 },
      { id: 's-components',label: 'Component Library', icon: Layers,     collected: false, x: 58, y: 65 },
    ],
    edges: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [1, 2]],
  },
  {
    tab: 'develop',
    label: 'Develop',
    color: 'text-develop',
    glowColor: 'rgba(var(--develop-glow),',
    hexColor: 'var(--develop-primary)',
    nodes: [
      { id: 'v-stack',   label: 'Tech Stack',   icon: Code2,    collected: false, x: 84, y: 30 },
      { id: 'v-data',     label: 'Data Model',   icon: Database, collected: false, x: 78, y: 52 },
      { id: 'v-api',      label: 'API Design',   icon: Cable,    collected: false, x: 92, y: 55 },
      { id: 'v-auth',     label: 'Auth Flow',    icon: Shield,   collected: false, x: 74, y: 76 },
      { id: 'v-deploy',   label: 'Deployment',   icon: Rocket,   collected: false, x: 88, y: 78 },
    ],
    edges: [[0, 1], [0, 2], [1, 3], [2, 4], [1, 2], [3, 4]],
  },
];

/** Cross-tree connections bridging the three clusters */
const CROSS_EDGES: { from: [number, number]; to: [number, number] }[] = [
  { from: [0, 2], to: [1, 1] }, // Dream:Core Problem → Design:Color Palette
  { from: [1, 4], to: [2, 1] }, // Design:Component Library → Develop:Data Model
  { from: [0, 4], to: [1, 3] }, // Dream:Success Metrics → Design:Layout System
  { from: [1, 2], to: [2, 0] }, // Design:Typography → Develop:Tech Stack
];

/* ───────── SVG circles for a node ───────── */
function SphereNodeSvg({
  node,
  hexColor,
  glowColor,
  active,
}: {
  node: SkillNode;
  hexColor: string;
  glowColor: string;
  active: boolean;
}) {
  const orbSize = 44;

  return (
    <g>
      {/* Outer glow ring */}
      <circle
        cx={`${node.x}%`}
        cy={`${node.y}%`}
        r={orbSize / 2 + 12}
        fill="none"
        stroke={hexColor}
        strokeWidth="0.5"
        opacity={active ? 0.4 : 0.2}
        style={{ transition: 'opacity 400ms' }}
      />
      {/* Pulse ring */}
      {active && (
        <circle
          cx={`${node.x}%`}
          cy={`${node.y}%`}
          r={orbSize / 2 + 8}
          fill="none"
          stroke={hexColor}
          strokeWidth="1"
          opacity="0.3"
        >
          <animate attributeName="r" from={`${orbSize / 2 + 8}`} to={`${orbSize / 2 + 20}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.3" to="0" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      {/* Opaque background — hides lines beneath the node */}
      <circle
        cx={`${node.x}%`}
        cy={`${node.y}%`}
        r={orbSize / 2}
        fill="var(--background)"
      />
      {/* Main orb */}
      <circle
        cx={`${node.x}%`}
        cy={`${node.y}%`}
        r={orbSize / 2}
        fill={active ? `${glowColor}0.15)` : `${glowColor}0.08)`}
        stroke={hexColor}
        strokeWidth={active ? 1.5 : 1}
        opacity={active ? 1 : 0.85}
        style={{ transition: 'all 300ms' }}
      />
      {/* Inner glow */}
      <circle
        cx={`${node.x}%`}
        cy={`${node.y}%`}
        r={orbSize / 2 - 6}
        fill={active ? `${glowColor}0.25)` : `${glowColor}0.05)`}
        style={{ transition: 'fill 300ms' }}
      />
    </g>
  );
}

/* ───────── HTML overlay for icon + label ───────── */
function SphereNodeHtml({
  node,
  hexColor,
  active,
  onHover,
}: {
  node: SkillNode;
  hexColor: string;
  active: boolean;
  onHover: (id: string | null) => void;
}) {
  const Icon = node.icon;

  return (
    <div
      className="absolute cursor-pointer"
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        width: 0,
        height: 0,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Icon — centered exactly on node position */}
      <Icon
        className="w-4 h-4"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          color: active ? hexColor : `${hexColor}cc`,
          transition: 'color 300ms, filter 300ms',
          filter: active ? `drop-shadow(0 0 6px ${hexColor})` : 'none',
        }}
      />
      {/* Label — below the orb */}
      <Eyebrow
        as="span"
        className="text-[9px] whitespace-nowrap text-foreground/80"
        style={{
          position: 'absolute',
          left: 0,
          top: 34,
          transform: 'translateX(-50%)',
          color: active ? hexColor : undefined,
          transition: 'color 300ms',
        }}
      >
        {node.label}
      </Eyebrow>
    </div>
  );
}

/* ───────── Main component ───────── */
export function ProjectScope() {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const totalSkills = SKILL_TREES.reduce((sum, t) => sum + t.nodes.length, 0);
  const totalCollected = SKILL_TREES.reduce(
    (sum, t) => sum + t.nodes.filter((n) => n.collected).length,
    0,
  );

  return (
    <div className="px-4">
      {/* Accordion trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="flex w-full items-center justify-center gap-2 py-2 text-xs text-foreground/60 hover:text-foreground/80 transition-colors"
      >
        <span className="font-display font-bold tracking-wider">PROJECT SCOPE</span>
        <Mono className="text-white/30">{totalCollected}/{totalSkills}</Mono>
        <ChevronUp
          className={`w-4 h-4 transition-transform duration-200 ${
            isOpen ? '' : 'rotate-180'
          }`}
        />
      </button>

      {/* Accordion content — sphere grid */}
      <div
        className={`transition-all duration-500 ease-out ${
          isOpen ? 'max-h-[75vh] opacity-100 mt-2' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="relative w-full rounded-2xl overflow-y-auto overflow-x-hidden" style={{ height: '65vh' }}>
          {/* Inner content taller than viewport to allow scrolling */}
          <div className="relative w-full" style={{ height: '120vh', minHeight: '800px' }}>
          {/* Background texture — subtle concentric rings */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle at 16% 50%, rgba(168,85,247,0.3) 0%, transparent 40%), radial-gradient(circle at 50% 45%, rgba(236,72,153,0.3) 0%, transparent 35%), radial-gradient(circle at 84% 50%, rgba(16,185,129,0.3) 0%, transparent 40%)',
          }} />

          {/* Tree labels */}
          {SKILL_TREES.map((tree) => {
            const centerX = tree.nodes.reduce((s, n) => s + n.x, 0) / tree.nodes.length;
            return (
              <Eyebrow
                key={tree.tab}
                className={`absolute tracking-[0.3em] ${tree.color} opacity-40`}
                style={{ left: `${centerX}%`, top: '10%', transform: 'translateX(-50%)' }}
              >
                {tree.label.toUpperCase()}
              </Eyebrow>
            );
          })}

          {/* SVG node graph */}
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              {SKILL_TREES.map((tree) => (
                <linearGradient key={`grad-${tree.tab}`} id={`edge-${tree.tab}`}>
                  <stop offset="0%" stopColor={tree.hexColor} stopOpacity="0.4" />
                  <stop offset="50%" stopColor={tree.hexColor} stopOpacity="0.15" />
                  <stop offset="100%" stopColor={tree.hexColor} stopOpacity="0.4" />
                </linearGradient>
              ))}
              <linearGradient id="edge-cross">
                <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
              </linearGradient>
            </defs>

            {/* Cross-tree connecting lines */}
            {CROSS_EDGES.map((edge, i) => {
              const fromNode = SKILL_TREES[edge.from[0]].nodes[edge.from[1]];
              const toNode = SKILL_TREES[edge.to[0]].nodes[edge.to[1]];
              return (
                <line
                  key={`cross-${i}`}
                  x1={`${fromNode.x}%`}
                  y1={`${fromNode.y}%`}
                  x2={`${toNode.x}%`}
                  y2={`${toNode.y}%`}
                  stroke="var(--foreground)"
                  strokeOpacity="0.14"
                  strokeWidth="1.6"
                  strokeDasharray="4 6"
                />
              );
            })}

            {/* Intra-tree edges */}
            {SKILL_TREES.map((tree) =>
              tree.edges.map(([a, b], i) => {
                const na = tree.nodes[a];
                const nb = tree.nodes[b];
                const bothCollected = na.collected && nb.collected;
                const isHovered =
                  (na.collected || hoveredNode === na.id) &&
                  (nb.collected || hoveredNode === nb.id);
                const isActive = bothCollected || isHovered;
                return (
                  <line
                    key={`${tree.tab}-edge-${i}`}
                    x1={`${na.x}%`}
                    y1={`${na.y}%`}
                    x2={`${nb.x}%`}
                    y2={`${nb.y}%`}
                    stroke={isActive ? tree.hexColor : 'var(--foreground)'}
                    strokeWidth={isActive ? 3 : 2}
                    opacity={isActive ? 0.9 : 0.22}
                    style={{ transition: 'stroke 300ms, opacity 300ms, stroke-width 300ms' }}
                  />
                );
              }),
            )}

            {/* Node circles (SVG only) */}
            {SKILL_TREES.map((tree) =>
              tree.nodes.map((node) => (
                <SphereNodeSvg
                  key={node.id}
                  node={node}
                  hexColor={tree.hexColor}
                  glowColor={tree.glowColor}
                  active={node.collected || hoveredNode === node.id}
                />
              )),
            )}
          </svg>

          {/* HTML icon + label overlay */}
          {SKILL_TREES.map((tree) =>
            tree.nodes.map((node) => (
              <SphereNodeHtml
                key={`html-${node.id}`}
                node={node}
                hexColor={tree.hexColor}
                active={node.collected || hoveredNode === node.id}
                onHover={setHoveredNode}
              />
            )),
          )}

          {/* Legend — above nodes */}
          <div className="absolute top-4 left-0 right-0 flex justify-center gap-6 z-10">
            {SKILL_TREES.map((tree) => {
              const count = tree.nodes.filter((n) => n.collected).length;
              return (
                <div key={tree.tab} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tree.hexColor, boxShadow: `0 0 6px ${tree.hexColor}` }}
                  />
                  <Eyebrow as="span" className={tree.color}>
                    {tree.label.toUpperCase()}
                  </Eyebrow>
                  <Mono className="text-[10px] text-white/30">{count}/{tree.nodes.length}</Mono>
                </div>
              );
            })}
          </div>
          </div>{/* close inner content */}
        </div>
      </div>
    </div>
  );
}
