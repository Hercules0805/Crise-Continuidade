/**
 * Value Object: RTO (Recovery Time Objective)
 * Represents the maximum acceptable time to restore a process after disruption.
 * Derived from the Tier classification.
 */
export type RTO = '< 4 horas' | '4h a 24 horas' | '> 24 horas';
