import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Heading, Text, Eyebrow, Mono } from './index';

/**
 * The Warehaus typography primitives — the system source of truth, usable
 * site-wide. Eurostile display voice, Geist body, mono eyebrows/data. Every
 * story snapshots in both themes via the global Chromatic modes.
 */
const meta = {
  title: 'Primitives/Typography',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const Row = ({ token, children }: { token: string; children: React.ReactNode }) => (
  <div className="flex items-baseline" style={{ gap: 'var(--s-5)' }}>
    <span className="ds-mono" style={{ width: 110, fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{token}</span>
    <div style={{ minWidth: 0 }}>{children}</div>
  </div>
);

export const Scale: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <Row token="display · 3xl"><Heading as="div" size="display">Build the system</Heading></Row>
      <Row token="h1 · 2xl"><Heading level={1}>Build the system</Heading></Row>
      <Row token="h2 · xl"><Heading level={2}>Build the system</Heading></Row>
      <Row token="h3 · lg"><Heading level={3} display={false}>Build the system</Heading></Row>
      <Row token="h4 · md"><Heading level={4} display={false}>Build the system</Heading></Row>
      <Row token="h5 · base"><Heading level={5} display={false}>Build the system</Heading></Row>
      <Row token="h6 · sm"><Heading level={6} display={false}>Build the system</Heading></Row>
    </div>
  ),
};

export const DisplayVoices: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
      <div>
        <Eyebrow>Default · type-display</Eyebrow>
        <Heading level={1}>Engineered, not decorated</Heading>
      </div>
      <div>
        <Eyebrow>Expressive lockup</Eyebrow>
        <Heading as="div" size="display" expressive>warehaus</Heading>
      </div>
      <div>
        <Eyebrow>Sub-head · type-heading</Eyebrow>
        <Heading level={3} display={false}>The lighter Eurostile 600 voice</Heading>
      </div>
    </div>
  ),
};

export const Overrides: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
      <Row token="default"><Heading level={2}>Black italic caps</Heading></Row>
      <Row token="caps=false"><Heading level={2} caps={false}>No uppercase</Heading></Row>
      <Row token="italic=false"><Heading level={2} italic={false}>No italic</Heading></Row>
      <Row token="display=false"><Heading level={2} display={false}>Lighter sub-head</Heading></Row>
    </div>
  ),
};

export const BodyText: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)', maxWidth: 640 }}>
      <Text lead>Lead — build the system that gets out of the way and lets the work speak for itself.</Text>
      <Text size="lg">Large body — open counters, even rhythm, comfortable for long reading at 1.6 line-height.</Text>
      <Text>Base body copy. Geist carries everything you actually read across the site, with weights from 300 to 700.</Text>
      <Text size="sm" muted>Small, muted — captions and secondary notes sit here, one step down in both size and contrast.</Text>
    </div>
  ),
};

export const EyebrowAndMono: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
      <div>
        <Eyebrow>Section kicker</Eyebrow>
        <Heading level={2}>Eyebrow over a heading</Heading>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[['INV-0042', '1,250.00'], ['INV-0117', '980.50'], ['INV-1003', '12,400.75']].map(([id, amt]) => (
          <div key={id} className="flex" style={{ gap: 'var(--s-6)' }}>
            <Mono code>{id}</Mono>
            <Mono style={{ marginLeft: 'auto' }}>{amt}</Mono>
          </div>
        ))}
      </div>
    </div>
  ),
};
