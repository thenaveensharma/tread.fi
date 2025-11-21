import { useContext, useEffect, useState } from 'react';
import { ErrorContext } from '@/shared/context/ErrorProvider';
import { ApiError, getUserReferrals } from '@/apiServices';

function useGetReferrals(isAuthed) {
  const { showAlert } = useContext(ErrorContext);
  const [isLoading, setIsLoading] = useState(true);
  const [userReferrals, setUserReferrals] = useState([]);
  const [userHyperliquidNotional, setUserHyperliquidNotional] = useState(0);
  const [userHyperliquidNotionalBeforeNov1, setUserHyperliquidNotionalBeforeNov1] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getUserReferrals();
        setUserReferrals(result.referrals || []);
        setUserHyperliquidNotional(result.user_hyperliquid_notional || 0);
        setUserHyperliquidNotionalBeforeNov1(result.user_hyperliquid_notional_before_nov1 || 0);
      } catch (e) {
        if (e instanceof ApiError) {
          showAlert({
            severity: 'error',
            message: `Failed to fetch user referrals data: ${e.message}`,
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthed) {
      fetchData();
    }
  }, [isAuthed]);

  return { userReferrals, userHyperliquidNotional, userHyperliquidNotionalBeforeNov1, isLoading };
}

export default useGetReferrals;
