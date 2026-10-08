export interface LogoProps {
  /** Altura do símbolo em px; a largura segue a proporção 360:96. Padrão: 32. */
  height?: number;
  /** "default" (texto em ink) | "on-dark" (texto em ink-on-dark, para surface-dark). Padrão: "default". */
  tone?: "default" | "on-dark";
}
export function Logo(props?: LogoProps): HTMLElement;

export interface BadgeProps {
  /** low | medium | high | critical. Padrão: "low". */
  level?: "low" | "medium" | "high" | "critical";
  /** Sobrescreve o rótulo padrão em português do nível. */
  label?: string;
}
export function Badge(props: BadgeProps): HTMLElement;

export interface ButtonProps {
  /** "primary" | "secondary". Padrão: "primary". */
  variant?: "primary" | "secondary";
  label?: string;
}
export function Button(props: ButtonProps): HTMLElement;

export interface MetricCardProps {
  label: string;
  value: string | number;
  /** Badge de severidade opcional, mostrado abaixo do valor. */
  level?: "low" | "medium" | "high" | "critical";
  /** Linha de tendência opcional, ex.: "+3 esta semana". */
  trend?: string;
}
export function MetricCard(props: MetricCardProps): HTMLElement;
