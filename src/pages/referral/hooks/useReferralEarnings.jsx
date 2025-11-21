import { useMemo } from 'react';

/**
 * Calculate referral earnings based on:
 * - Referred users' Hyperliquid executed notional
 * - User's own Hyperliquid executed notional before October 30, 2025
 * Commission rate: 0.8 basis points (0.008%) of executed notional
 */
function useReferralEarnings(userReferrals, userHyperliquidNotional, userHyperliquidNotionalBeforeNov1) {
  const earnings = useMemo(() => {
    // Calculate total executed notional from all referred users
    const totalReferralNotional = (userReferrals || []).reduce((sum, referral) => {
      return sum + (referral.hyperliquid_executed_notional || 0);
    }, 0);

    // Add user's own notional before October 30th
    const totalNotionalForEarnings = totalReferralNotional + (userHyperliquidNotionalBeforeNov1 || 0);

    // Commission rate: 0.8 basis points = 0.008% = 0.00008
    const commissionRate = 0.00008;
    const pendingEarnings = totalNotionalForEarnings * commissionRate;

    return {
      pendingEarnings,
      availableEarnings: 0, // Set to $0 as per requirement
      lifetimeEarnings: pendingEarnings, // Same as pending earnings as per requirement
    };
  }, [userReferrals, userHyperliquidNotional, userHyperliquidNotionalBeforeNov1]);

  return earnings;
}

export default useReferralEarnings;
