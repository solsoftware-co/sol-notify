import { Text, Link } from '@react-email/components';
import { colors, typography, borders, spacing } from '../styles';
import { LabelText } from './label-text';

// Based on the old service's data-table.tsx (same title, header row and row
// styling), fixed at three columns — name, status, link — so it still fits
// a phone. Per-row text links rather than buttons: several equal buttons
// compete with each other and stack badly on mobile.
export type IntegrationOutcome = 'succeeded' | 'failed' | 'skipped';

export type IntegrationResult = {
    name: string;
    outcome: IntegrationOutcome;
    url?: string;
    /** Short reason, shown under the status. */
    detail?: string;
};

type IntegrationResultsProps = {
    integrations: IntegrationResult[];
};

const statusLabel: Record<IntegrationOutcome, string> = {
    succeeded: '✓ Added',
    failed: '✗ Failed',
    skipped: 'Skipped',
};

const headerCell = {
    fontFamily: typography.fontStack,
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.medium,
    color: colors.textMuted,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: borders.tableRow,
} as const;

const bodyCell = {
    fontFamily: typography.fontStack,
    fontSize: '14px',
    fontWeight: typography.weights.regular,
    color: colors.textPrimary,
    textAlign: 'left',
    verticalAlign: 'top',
    padding: '10px 12px',
    borderBottom: borders.tableRow,
} as const;

export function IntegrationResults({ integrations }: IntegrationResultsProps) {
    const failed = integrations.filter((i) => i.outcome === 'failed').length;

    // paddingBottom matches FieldGroup's trailing cell padding, so a CTA
    // below sits the same distance from either.
    return (
        <div style={{ paddingBottom: spacing.md }}>
            <Text style={{
                fontFamily: typography.fontStack,
                fontSize: typography.sizes.body,
                fontWeight: typography.weights.medium,
                color: colors.textPrimary,
                margin: `0 0 ${spacing.sm} 0`,
            }}>
                Integrations
            </Text>
            {/* A single row already says ✗ Failed; the summary only helps once there are several to scan. */}
            {failed > 0 && integrations.length > 1 && (
                <Text style={{
                    fontFamily: typography.fontStack,
                    fontSize: typography.sizes.small,
                    fontWeight: typography.weights.regular,
                    color: colors.textMuted,
                    lineHeight: typography.lineHeights.small,
                    margin: `0 0 ${spacing.sm} 0`,
                }}>
                    {`${failed} of ${integrations.length} integrations failed`}
                </Text>
            )}
            <table
                role="presentation"
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{ borderCollapse: 'collapse' }}
            >
                <thead>
                    <tr style={{ backgroundColor: colors.bg }}>
                        <th style={headerCell}>Integration</th>
                        <th style={headerCell}>Status</th>
                        <th style={{ ...headerCell, textAlign: 'right' }}>&nbsp;</th>
                    </tr>
                </thead>
                <tbody>
                    {integrations.map((integration, i) => {
                        return (
                            <tr key={i}>
                                <td style={bodyCell}>{integration.name}</td>
                                <td style={bodyCell}>
                                    <LabelText style={{ margin: '0' }}>{statusLabel[integration.outcome]}</LabelText>
                                    {integration.detail && (
                                        <span style={{
                                            display: 'block',
                                            fontSize: typography.sizes.small,
                                            color: colors.textSecondary,
                                            lineHeight: typography.lineHeights.small,
                                            paddingTop: '2px',
                                        }}>
                                            {integration.detail}
                                        </span>
                                    )}
                                </td>
                                <td style={{ ...bodyCell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    {integration.url && (
                                        <Link href={integration.url} style={{
                                            fontFamily: typography.fontStack,
                                            fontSize: '14px',
                                            color: colors.accent,
                                            textDecoration: 'none',
                                        }}>
                                            View →
                                        </Link>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
