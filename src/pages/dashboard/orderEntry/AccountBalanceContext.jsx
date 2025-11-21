import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useOrderForm } from '@/shared/context/OrderFormProvider';
import { ErrorContext } from '@/shared/context/ErrorProvider';
import { useUserMetadata } from '@/shared/context/UserMetadataProvider';
import { fetchCachedAccountBalances } from '@/apiServices';

const AccountBalanceContext = createContext();

export function AccountBalanceProvider({ children }) {
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0=Orders, 1=Positions, 2=Balances
  const { showAlert } = useContext(ErrorContext);
  const { balances, setBalances, selectedAccounts, selectedPair, initialLoadValue } = useOrderForm();
  const { user } = useUserMetadata();

  const getAccountBalances = async (accountNames = []) => {
    let data;
    setIsBalanceLoading(true);
    try {
      data = await fetchCachedAccountBalances(accountNames);
    } catch (e) {
      showAlert({
        severity: 'error',
        message: e.message,
      });
      setIsBalanceLoading(false);
      return false;
    }
    const entryBalances = {};

    data.balances.forEach((balance) => {
      entryBalances[balance.account_id] = balance;
    });

    setBalances(entryBalances);
    setIsBalanceLoading(false);
    return true;
  };

  useEffect(() => {
    if (user && user.is_authenticated) {
      // Determine which accounts to poll based on active tab
      // If on Positions (1) or Balances (2) tab, poll all accounts
      // If on Orders (0) tab or elsewhere, only poll selected accounts
      const shouldPollAllAccounts = activeTab === 1 || activeTab === 2;
      const accountsToPoll = shouldPollAllAccounts ? [] : selectedAccounts;

      // Only start polling if we have selected accounts OR we're on a tab that needs all accounts
      if (shouldPollAllAccounts || (selectedAccounts && selectedAccounts.length > 0)) {
        getAccountBalances(accountsToPoll);

        const intervalId = setInterval(() => {
          getAccountBalances(accountsToPoll);
        }, 13000);
        return () => clearInterval(intervalId);
      }
    }
    return () => {};
  }, [selectedAccounts, user, activeTab]);

  // Helpers to compute balances across selected accounts
  const calculateAssetBalance = (symbol, overrides = {}) => {
    let totalAmount = 0;

    const effectiveSelectedAccounts = overrides.selectedAccounts || selectedAccounts;
    const effectiveSelectedPair = overrides.selectedPair || selectedPair;
    const effectiveAccounts = overrides.accounts || (initialLoadValue && initialLoadValue.accounts) || {};

    const marketType = effectiveSelectedPair?.market_type;

    if (!effectiveAccounts || !effectiveSelectedAccounts || !balances) {
      return totalAmount;
    }

    effectiveSelectedAccounts.forEach((accountName) => {
      const account = effectiveAccounts[accountName];
      if (!account || !balances[account.id] || !balances[account.id].assets) return;

      const isHyperliquid = account.exchangeName === 'Hyperliquid';
      const isUsdH = symbol === 'USDH';

      balances[account.id].assets.forEach((asset) => {
        const walletType = asset.wallet_type || '';
        const isHyperliquidUsdHSpotWallet =
          isHyperliquid && isUsdH && asset.symbol === 'USDH' && walletType === 'spot';
        const isHyperliquidUsdHPerpWallet =
          isHyperliquid && isUsdH && asset.symbol === 'USDH' && walletType.toLowerCase().includes('perp');

        if (
          asset.wallet_type !== 'unified' &&
          marketType &&
          asset.wallet_type !== marketType &&
          !isHyperliquidUsdHSpotWallet &&
          !isHyperliquidUsdHPerpWallet
        ) {
          return;
        }

        if (asset.symbol === symbol) {
          const balance = Number(asset.amount || asset.size || 0);
          const borrowed = Number(asset.borrowed || 0);
          totalAmount += balance - borrowed;
        }
      });
    });

    return totalAmount;
  };

  const getCurrentBalance = (overrides = {}) => {
    const pair = overrides.selectedPair || selectedPair;
    if (!pair) return 0;
    const baseIdentifier = pair.is_contract ? pair.id : pair.base;
    return calculateAssetBalance(baseIdentifier, overrides);
  };

  const getUSDTBalance = (overrides = {}) => calculateAssetBalance('USDT', overrides);

  const calculateMarginBalance = (symbol, overrides = {}) => {
    let totalMarginBalance = 0;

    const effectiveSelectedAccounts = overrides.selectedAccounts || selectedAccounts;
    const effectiveSelectedPair = overrides.selectedPair || selectedPair;
    const effectiveAccounts = overrides.accounts || (initialLoadValue && initialLoadValue.accounts) || {};

    const marketType = effectiveSelectedPair?.market_type;

    if (!effectiveAccounts || !effectiveSelectedAccounts || !balances) {
      return totalMarginBalance;
    }

    effectiveSelectedAccounts.forEach((accountName) => {
      const account = effectiveAccounts[accountName];
      if (!account || !balances[account.id] || !balances[account.id].assets) return;

      const isHyperliquid = account.exchangeName === 'Hyperliquid';
      const isHyperliquidSpot = isHyperliquid && marketType === 'spot';
      const isPacifica = account.exchangeName === 'Pacifica';
      const isParadex = account.exchangeName === 'Paradex';
      const isUsdH = symbol === 'USDH';

      // Special handling for Hyperliquid spot: USDC + spot pair notional
      if (isHyperliquidSpot && symbol === 'USDC') {
        let usdcBalance = 0;
        let spotPairNotional = 0;

        balances[account.id].assets.forEach((asset) => {
          if (asset.wallet_type !== 'unified' && asset.wallet_type !== marketType) {
            return;
          }

          // Add USDC balance
          if (asset.symbol === 'USDC') {
            const balance = Number(asset.amount || asset.size || 0);
            const borrowed = Number(asset.borrowed || 0);
            usdcBalance += balance - borrowed;
          }

          // Add the spot pair's notional if it matches the selected pair's base
          if (effectiveSelectedPair && asset.symbol === effectiveSelectedPair.base && asset.wallet_type === 'spot') {
            spotPairNotional += Math.abs(Number(asset.notional || 0));
          }
        });

        totalMarginBalance += usdcBalance + spotPairNotional;
        return;
      }

      // Hyperliquid USDH should include both spot and perp wallet balances
      if (isHyperliquid && isUsdH) {
        let hyperliquidUsdHBalance = 0;

        balances[account.id].assets.forEach((asset) => {
          if (asset.symbol !== 'USDH') return;

          const walletType = asset.wallet_type || '';
          const isUnified = walletType === 'unified';
          const isSpotWallet = walletType === 'spot';
          const isPerpWallet = walletType.toLowerCase().includes('perp');

          if (!isUnified && !isSpotWallet && !isPerpWallet) {
            return;
          }

          const marginBalance = Number(asset.margin_balance || 0);
          if (marginBalance > 0) {
            hyperliquidUsdHBalance += marginBalance;
          } else {
            const balance = Number(asset.amount || asset.size || 0);
            const borrowed = Number(asset.borrowed || 0);
            hyperliquidUsdHBalance += balance - borrowed;
          }

          // Include isolated margin from perp wallets
          if (isPerpWallet && asset.asset_type === 'position') {
            const initialMargin = Number(asset.initial_margin || 0);
            if (initialMargin > 0) {
              hyperliquidUsdHBalance += initialMargin;
            }
          }
        });

        totalMarginBalance += hyperliquidUsdHBalance;
        return;
      }

      balances[account.id].assets.forEach((asset) => {
        const is_hl_perp_dex = isHyperliquid && asset.wallet_type?.includes('perpdex-');
        const walletType = asset.wallet_type || '';
        const isHyperliquidUsdHSpotWallet =
          isHyperliquid && isUsdH && asset.symbol === 'USDH' && walletType === 'spot';

        if (
          asset.wallet_type !== 'unified' &&
          marketType &&
          asset.wallet_type !== marketType &&
          !is_hl_perp_dex &&
          !isPacifica &&
          !isParadex &&
          !isHyperliquidUsdHSpotWallet
        ) {
          return;
        }

        if (asset.symbol === symbol) {
          // Use margin_balance if available, otherwise fall back to regular balance calculation
          const marginBalance = Number(asset.margin_balance || 0);
          if (marginBalance > 0) {
            totalMarginBalance += marginBalance;
          } else {
            // Fallback to regular balance calculation
            const balance = Number(asset.amount || asset.size || 0);
            const borrowed = Number(asset.borrowed || 0);
            totalMarginBalance += balance - borrowed;
          }

          // For Hyperliquid perp positions, also include isolated margin (initial_margin)
          if (isHyperliquid && asset.asset_type === 'position' && marketType === 'perp') {
            const initialMargin = Number(asset.initial_margin || 0);
            totalMarginBalance += initialMargin;
          }
        }
      });
    });

    return totalMarginBalance;
  };

  const memoizedAccountBalances = useMemo(
    () => ({
      balances,
      isBalanceLoading,
      refreshBalances: getAccountBalances,
      calculateAssetBalance,
      calculateMarginBalance,
      getCurrentBalance,
      getUSDTBalance,
      activeTab,
      setActiveTab,
    }),
    [balances, isBalanceLoading, selectedAccounts, selectedPair, initialLoadValue, activeTab]
  );

  return <AccountBalanceContext.Provider value={memoizedAccountBalances}>{children}</AccountBalanceContext.Provider>;
}

export const useAccountBalanceContext = () => {
  const context = useContext(AccountBalanceContext);

  // Return dummy values if no provider is found
  if (!context) {
    return {
      balances: {},
      isBalanceLoading: false,
      refreshBalances: () => {},
      calculateAssetBalance: () => 0,
      calculateMarginBalance: () => 0,
      getCurrentBalance: () => 0,
      getUSDTBalance: () => 0,
      activeTab: 0,
      setActiveTab: () => {},
    };
  }

  return context;
};
