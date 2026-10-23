/**
 * "Title · host" when the app knows more than one host, else just "Title".
 * With several daemons running this plugin the same entry would otherwise look identical.
 */
export function hostTitle(title: string, hostLabel: string, hostCount: number): string {
  return hostCount > 1 && hostLabel ? `${title} · ${hostLabel}` : title;
}
