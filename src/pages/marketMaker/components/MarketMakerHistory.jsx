import React, { useMemo, useEffect, useRef, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
  Pagination,
  FormControlLabel,
  Checkbox,
  IconButton,
  Tooltip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import { useNavigate } from 'react-router-dom';
import { ExchangeIcon } from '@/shared/components/Icons';
import CountUp from '@/shared/components/CountUp';
import { msAndKs, insertEllipsis } from '@/util';
import { useInView, useMotionValue, useSpring } from 'framer-motion';
import { useInitialLoadData } from '@/shared/context/InitialLoadDataProvider';
import ProgressBar from '@/shared/fields/ProgressBar/ProgressBar';
import { useThemeContext } from '@/theme/ThemeContext';
import { useTheme } from '@emotion/react';
import ReplayIcon from '@mui/icons-material/Replay';
import CancelIcon from '@mui/icons-material/Cancel';
import ShareIcon from '@mui/icons-material/Share';
import { hydrateMultiOrderResubmit } from '@/shared/orderTable/multiOrderResubmitUtils';
import { submitMultiOrder, cancelMultiOrder } from '@/apiServices';
import { useToast } from '@/shared/context/ToastProvider';
import { useSound } from '@/hooks/useSound';
import ICONS from '@/../images/exchange_icons';
import getBaseTokenIcon from '@/../images/tokens';
import { useUserMetadata } from '@/shared/context/UserMetadataProvider';
import MarketMakerShareableModal from './MarketMakerShareableModal';

// Render exchange icon with token icon badge (shared by desktop and mobile views)
function ExchangeVenueIcon({ pair, accountName, exchange, getAccount }) {
  if (!pair || !accountName) return null;

  const [base] = pair.split('-');
  if (!base) return null;

  const [baseToken] = base.split(':');
  const tokenIconSrc = getBaseTokenIcon(baseToken);
  // Use exchange from prop if available, otherwise fallback to account
  const exchangeName = exchange || getAccount(accountName)?.exchangeName;
  const exchangeIconUrl = exchangeName ? ICONS[exchangeName.toLowerCase()] : null;

  if (!tokenIconSrc && !exchangeIconUrl) return null;

  return (
    <Tooltip arrow title={accountName || exchangeName}>
      <Box display='inline-block' position='relative' sx={{ pr: 0 }}>
        {tokenIconSrc ? (
          <>
            <img
              alt={`${baseToken} token`}
              height='24.75px'
              src={tokenIconSrc}
              style={{ borderRadius: '50%' }}
              width='24.75px'
            />
            {exchangeIconUrl && (
              <Box bottom={0} position='absolute' right={0} sx={{ transform: 'translate(25%, 25%)' }}>
                <img
                  alt={`${exchangeName} exchange`}
                  height='12.375px'
                  src={exchangeIconUrl}
                  style={{ borderRadius: '50%' }}
                  width='12.375px'
                />
              </Box>
            )}
          </>
        ) : (
          <img
            alt={`${exchangeName} exchange`}
            height='24.75px'
            src={exchangeIconUrl}
            style={{ borderRadius: '50%' }}
            width='24.75px'
          />
        )}
      </Box>
    </Tooltip>
  );
}

// Custom CountUp component that animates formatted numbers (K/M/B)
function FormattedCountUp({ to, from = 0, duration = 0.3, formatter = msAndKs }) {
  const toNum = typeof to === 'string' ? parseFloat(to) : to;
  const fromNum = typeof from === 'string' ? parseFloat(from) : from;

  const ref = useRef(null);
  const motionValue = useMotionValue(fromNum);

  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);

  const springValue = useSpring(motionValue, {
    damping,
    stiffness,
  });

  const isInView = useInView(ref, { once: true, margin: '0px' });

  useEffect(() => {
    if (isInView) {
      motionValue.set(fromNum);

      const timeoutId = setTimeout(() => {
        motionValue.set(toNum);
      }, 0);

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isInView, motionValue, fromNum, toNum]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = formatter(latest, 2);
      }
    });

    return () => unsubscribe();
  }, [springValue, formatter]);

  return <span ref={ref} />;
}

export default function MarketMakerHistory({ history, showActiveOnly, setShowActiveOnly }) {
  const {
    marketMakerOrders,
    loading,
    currentPageNumber,
    currentPageSize,
    numPages,
    count,
    setCurrentPageNumber,
    refresh,
  } = history;
  const { getAccount } = useInitialLoadData();
  const navigate = useNavigate();
  const { currentTheme } = useThemeContext();
  const [resubmitLoading, setResubmitLoading] = useState({});
  const [cancelLoading, setCancelLoading] = useState({});
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedMMBotData, setSelectedMMBotData] = useState(null);
  const { showToastMessage } = useToast();
  const { playOrderSuccess } = useSound();
  const { referralCode } = useUserMetadata();
  const theme = useTheme();

  const rows = useMemo(() => {
    if (!Array.isArray(marketMakerOrders)) return [];
    return marketMakerOrders.map((o) => {
      const feeNotional = parseFloat(o.fee_notional || 0);

      // Extract exchange from child_orders[0].exchanges
      let exchange = null;
      if (o.child_orders && Array.isArray(o.child_orders) && o.child_orders.length > 0) {
        const firstChildOrder = o.child_orders[0];
        if (
          firstChildOrder.exchanges &&
          Array.isArray(firstChildOrder.exchanges) &&
          firstChildOrder.exchanges.length > 0
        ) {
          [exchange] = firstChildOrder.exchanges;
        }
      }

      // Calculate MM PnL in bps and dollar amount
      let mmPnLBps = null;
      let mmPnLDollar = null;
      if (o.child_orders && Array.isArray(o.child_orders)) {
        const buyOrder = o.child_orders.find((child) => child.side === 'buy');
        const sellOrder = o.child_orders.find((child) => child.side === 'sell');

        if (buyOrder && sellOrder && buyOrder.average_executed_price && sellOrder.average_executed_price) {
          const buyPrice = parseFloat(buyOrder.average_executed_price);
          const sellPrice = parseFloat(sellOrder.average_executed_price);
          const priceSpread = sellPrice - buyPrice;
          mmPnLBps = ((priceSpread / buyPrice) * 10000) / 2;

          // Calculate dollar PnL: executed_notional * (mmPnLBps / 10000)
          const executedNotional = parseFloat(o.executed_notional || 0);
          mmPnLDollar = executedNotional * (mmPnLBps / 10000);
        }
      }

      return {
        id: o.id,
        status: o.status,
        is_active: o.is_active,
        pct_filled: o.pct_filled,
        notional_exposure: o.notional_exposure,
        pair: (o.pairs || '').split(',')[0] || '-',
        accounts: o.account_names || [],
        executed_notional: o.executed_notional,
        fee_notional: o.fee_notional,
        mmPnLBps,
        mmPnLDollar,
        netFees: feeNotional,
        exchange,
      };
    });
  }, [marketMakerOrders]);

  const formatNumber = (value, options = {}) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    try {
      return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        ...options,
      }).format(Number(value));
    } catch (_) {
      return String(value);
    }
  };

  const formatPct = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return `${Math.round(num)}%`;
  };

  const getStatusColor = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'COMPLETE') return 'success';
    if (s === 'CANCELED' || s === 'CANCELLED') return 'error';
    if (s === 'ACTIVE' || s === 'RUNNING' || s === 'PAUSED' || s === 'FINISHER') return 'info';
    if (s === 'PENDING') return 'warning';
    return 'default';
  };

  const formatStatus = (status) => {
    const statusMap = {
      COMPLETE: 'Complete',
      CANCELED: 'Canceled',
      CANCELLED: 'Canceled',
      ACTIVE: 'Active',
      RUNNING: 'Running',
      PAUSED: 'Active', // Override PAUSED to display as Active
      PENDING: 'Pending',
      FINISHER: 'Active', // Override FINISHER to display as Active
    };
    return statusMap[status] || status;
  };

  const isWalletAddress = (value) => {
    const s = String(value || '');
    // Check for Ethereum address (0x + 40 hex chars)
    const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(s);
    // Check for Solana address (32-44 base58 chars)
    const isSolAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
    return isEthAddress || isSolAddress;
  };

  const handleOrderClick = (orderId) => {
    const url = `/multi_order/${orderId}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleResubmit = async (orderId, event) => {
    event.stopPropagation();
    setResubmitLoading((prev) => ({ ...prev, [orderId]: true }));

    try {
      const { submitPayload } = await hydrateMultiOrderResubmit(orderId);

      // Ensure market_maker flag is set to true for resubmitted MM orders
      const mmPayload = {
        ...submitPayload,
        market_maker: true,
      };

      const response = await submitMultiOrder(mmPayload);

      playOrderSuccess();
      showToastMessage({
        type: 'success',
        message: 'Volume Bot order resubmitted successfully.',
      });

      // Refresh the data
      await refresh();
    } catch (error) {
      showToastMessage({
        type: 'error',
        message: error.message || 'Failed to resubmit Volume Bot order.',
      });
    } finally {
      setResubmitLoading((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleCancel = async (orderId, event) => {
    event.stopPropagation();
    setCancelLoading((prev) => ({ ...prev, [orderId]: true }));

    try {
      await cancelMultiOrder(orderId);

      showToastMessage({
        type: 'success',
        message: 'Volume Bot order canceled successfully.',
      });

      // Refresh the data
      await refresh();
    } catch (error) {
      showToastMessage({
        type: 'error',
        message: error.message || 'Failed to cancel Volume Bot order.',
      });
    } finally {
      setCancelLoading((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleShareClick = async (row, event) => {
    event.stopPropagation();

    try {
      // Extract data from row
      const volume = row.executed_notional || 0;
      const netFees = row.netFees || row.fee_notional || 0;
      const mmPnL = row.mmPnLDollar || 0;
      const pair = row.pair || 'N/A';

      // Get exchange name from row data (extracted from child_orders[0].exchanges)
      const exchangeName = row.exchange || 'N/A';

      // Get duration from the original order - API returns duration in seconds, convert to minutes for formatDuration
      let duration = 0;
      const originalOrder = marketMakerOrders.find((o) => o.id === row.id);
      if (originalOrder?.duration) {
        // Convert from seconds to minutes (formatDuration expects minutes)
        duration = originalOrder.duration / 60;
      }

      // Build mmBotData object
      const mmBotData = {
        volume,
        netFees,
        mmPnL,
        exchange: exchangeName,
        pair,
        duration,
        referralCode: referralCode || '',
      };

      // Set state and open modal
      setSelectedMMBotData(mmBotData);
      setShareModalOpen(true);
    } catch (error) {
      showToastMessage({
        type: 'error',
        message: error.message || 'Failed to prepare share data.',
      });
    }
  };

  const renderHeader = () => (
    <Grid container sx={{ px: 2, py: 1.5 }}>
      <Grid xs={0.5}>
        <Typography color='text.secondary' variant='small1'>
          {/* Exchange column header - empty like in SharedOrderTable */}
        </Typography>
      </Grid>
      <Grid xs={2}>
        <Typography color='text.secondary' variant='small1'>
          Pair
        </Typography>
      </Grid>
      <Grid xs={1.75}>
        <Typography color='text.secondary' variant='small1'>
          Account
        </Typography>
      </Grid>
      <Grid xs={1.75}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title='Total executed notional (buy + sell)'>
            <Typography color='text.secondary' sx={{ cursor: 'help' }} variant='small1'>
              Volume
            </Typography>
          </Tooltip>
        </Box>
      </Grid>
      <Grid xs={1.25}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title='Total fees paid to exchange'>
            <Typography color='text.secondary' sx={{ cursor: 'help' }} variant='small1'>
              Net Fees
            </Typography>
          </Tooltip>
        </Box>
      </Grid>
      <Grid xs={1.25}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title='Executed Notional × PnL%'>
            <Typography color='text.secondary' sx={{ cursor: 'help' }} variant='small1'>
              MM PnL
            </Typography>
          </Tooltip>
        </Box>
      </Grid>
      <Grid xs={1.5}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Typography color='text.secondary' variant='small1'>
            Filled
          </Typography>
        </Box>
      </Grid>
      <Grid xs={0.75}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Typography color='text.secondary' variant='small1'>
            Status
          </Typography>
        </Box>
      </Grid>
      <Grid xs={1.25}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Typography color='text.secondary' variant='small1'>
            Actions
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );

  const renderRow = (row) => {
    const isTerminalStatus =
      row.status === 'COMPLETE' || row.status === 'CANCELED' || row.status === 'CANCELLED' || row.status === 'FINISHER';
    const canResubmit = isTerminalStatus && row.pct_filled > 0;
    const canCancel = !isTerminalStatus;

    return (
      <Grid
        container
        key={row.id}
        sx={{
          px: 2,
          py: 0.5,
          cursor: 'pointer',
          alignItems: 'center',
          minHeight: '40px',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          transition: 'background-color 0.2s ease',
        }}
        onClick={() => handleOrderClick(row.id)}
      >
        <Grid sx={{ pl: 0.5, pr: 0.5 }} xs={0.5}>
          {Array.isArray(row.accounts) && row.accounts.length > 0 && (
            <ExchangeVenueIcon
              accountName={row.accounts[0]}
              exchange={row.exchange}
              getAccount={getAccount}
              pair={row.pair}
            />
          )}
        </Grid>
        <Grid xs={2}>
          <Typography variant='body1'>{row.pair}</Typography>
        </Grid>
        <Grid xs={1.75}>
          <Stack alignItems='center' direction='row' spacing={1}>
            {Array.isArray(row.accounts) && row.accounts.length > 0 ? (
              row.accounts.map((accountName) => {
                // Use exchange from row data if available, otherwise fallback to account
                const exchangeName = row.exchange || getAccount(accountName)?.exchangeName;
                let displayAccount = accountName;
                if (isWalletAddress(accountName)) {
                  displayAccount = insertEllipsis(accountName, 4, 4);
                } else if (accountName.length > 15) {
                  displayAccount = `${accountName.substring(0, 15)}...`;
                }
                return (
                  <Stack alignItems='center' direction='row' key={accountName} spacing={1}>
                    <ExchangeIcon exchangeName={exchangeName} style={{ height: '20px', width: '20px' }} />
                    <Typography variant='body1'>{displayAccount}</Typography>
                  </Stack>
                );
              })
            ) : (
              <Typography variant='body1'>N/A</Typography>
            )}
          </Stack>
        </Grid>
        <Grid xs={1.75}>
          <Typography sx={{ textAlign: 'right' }} variant='body1'>
            <span style={{ color: 'grey' }}>$</span>
            {row.is_active ? (
              <FormattedCountUp to={row.executed_notional || 0} />
            ) : (
              msAndKs(row.executed_notional || 0, 2)
            )}
          </Typography>
        </Grid>
        <Grid xs={1.25}>
          <Typography
            sx={{
              textAlign: 'right',
              color: (() => {
                if (row.netFees === null || row.netFees === undefined) return 'text.secondary';
                return row.netFees >= 0 ? 'text.primary' : 'success.main';
              })(),
            }}
            variant='body1'
          >
            {row.netFees !== null && row.netFees !== undefined ? (
              <>
                {row.netFees < 0 ? '-' : ''}
                <span style={{ color: row.netFees >= 0 ? theme.palette.text.primary : theme.palette.success.main }}>
                  $
                </span>
                {row.is_active ? <FormattedCountUp to={Math.abs(row.netFees)} /> : msAndKs(Math.abs(row.netFees), 2)}
              </>
            ) : (
              '-'
            )}
          </Typography>
        </Grid>
        <Grid xs={1.25}>
          <Typography
            sx={{
              textAlign: 'right',
              color: (() => {
                if (row.mmPnLDollar === null) return 'text.secondary';
                return row.mmPnLDollar >= 0 ? 'success.main' : 'error.main';
              })(),
            }}
            variant='body1'
          >
            {row.mmPnLDollar !== null ? (
              <>
                {row.mmPnLDollar < 0 ? '-' : ''}
                <span style={{ color: row.mmPnLDollar >= 0 ? theme.palette.success.main : theme.palette.error.main }}>
                  $
                </span>
                {(() => {
                  if (row.mmPnLDollar === 0) return '0.00';
                  if (row.is_active) return <FormattedCountUp to={Math.abs(row.mmPnLDollar)} />;
                  return msAndKs(Math.abs(row.mmPnLDollar), 2);
                })()}
              </>
            ) : (
              '-'
            )}
          </Typography>
        </Grid>
        <Grid xs={1.5}>
          <Box sx={{ display: 'flex', justifyContent: 'center', px: 4, py: 1.5 }}>
            <ProgressBar
              containerStyleOverride={{ width: '80%' }}
              isDark={currentTheme === 'dark'}
              isPov={false}
              orderStatus={row.status}
              progress={Math.round(Number(row.pct_filled || 0))}
            />
          </Box>
        </Grid>
        <Grid xs={0.75}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Typography
              sx={{
                color: (() => {
                  const statusColor = getStatusColor(row.status);
                  switch (statusColor) {
                    case 'success':
                      return 'success.main';
                    case 'error':
                      return 'error.main';
                    case 'warning':
                      return 'warning.main';
                    case 'info':
                      return 'info.main';
                    default:
                      return 'text.primary';
                  }
                })(),
              }}
              variant='body1'
            >
              {formatStatus(row.status)}
            </Typography>
          </Box>
        </Grid>
        <Grid xs={1.25}>
          <Stack alignItems='center' direction='row' justifyContent='flex-end' spacing={0.5}>
            {canCancel && (
              <Tooltip title='Cancel Volume Bot Order'>
                <IconButton
                  disabled={cancelLoading[row.id]}
                  size='small'
                  sx={{
                    color: theme.palette.error.main,
                    '&:hover': {
                      backgroundColor: `${theme.palette.error.main}20`,
                    },
                  }}
                  onClick={(event) => handleCancel(row.id, event)}
                >
                  {cancelLoading[row.id] ? <CircularProgress size={16} /> : <CancelIcon fontSize='small' />}
                </IconButton>
              </Tooltip>
            )}
            {canResubmit && (
              <Tooltip title='Resubmit Volume Bot Order'>
                <IconButton
                  disabled={resubmitLoading[row.id]}
                  size='small'
                  sx={{
                    color: theme.palette.primary.main,
                    '&:hover': {
                      backgroundColor: `${theme.palette.primary.main}20`,
                    },
                  }}
                  onClick={(event) => handleResubmit(row.id, event)}
                >
                  {resubmitLoading[row.id] ? <CircularProgress size={16} /> : <ReplayIcon fontSize='small' />}
                </IconButton>
              </Tooltip>
            )}
            {(row.status === 'COMPLETE' || row.status?.toUpperCase() === 'COMPLETE') && (
              <Tooltip title='Share Market Maker Bot'>
                <IconButton
                  size='small'
                  sx={{
                    color: theme.palette.text.primary,
                    marginLeft: '4px',
                    '&:hover': {
                      color: theme.palette.primary.main,
                      backgroundColor: `${theme.palette.primary.main}20`,
                    },
                  }}
                  onClick={(event) => handleShareClick(row, event)}
                >
                  <ShareIcon fontSize='small' />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Grid>
      </Grid>
    );
  };

  const renderSkeletonRow = (key) => (
    <Grid
      container
      key={key}
      sx={{
        px: 2,
        py: 1,
        alignItems: 'center',
        minHeight: '48px', // Match the actual row height
      }}
    >
      <Grid sx={{ pl: 0.5, pr: 0.5 }} xs={0.5}>
        <Skeleton animation='wave' height={24.75} variant='circular' width={24.75} />
      </Grid>
      <Grid xs={2}>
        <Skeleton animation='wave' height={24} variant='rounded' width='60%' />
      </Grid>
      <Grid xs={1.75}>
        <Stack alignItems='center' direction='row' spacing={1}>
          <Skeleton animation='wave' height={20} variant='circular' width={20} />
          <Skeleton animation='wave' height={24} variant='rounded' width='70%' />
        </Stack>
      </Grid>
      <Grid xs={1.75}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton animation='wave' height={24} variant='rounded' width='80%' />
        </Box>
      </Grid>
      <Grid xs={1.25}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton animation='wave' height={24} variant='rounded' width='70%' />
        </Box>
      </Grid>
      <Grid xs={1.25}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton animation='wave' height={24} variant='rounded' width='70%' />
        </Box>
      </Grid>
      <Grid xs={1.5}>
        <Box sx={{ display: 'flex', justifyContent: 'center', px: 4 }}>
          <Skeleton animation='wave' height={24} variant='rounded' width='80%' />
        </Box>
      </Grid>
      <Grid xs={0.75}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Skeleton animation='wave' height={24} variant='rounded' width='60%' />
        </Box>
      </Grid>
      <Grid xs={1.25}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton animation='wave' height={24} variant='rounded' width='50%' />
        </Box>
      </Grid>
    </Grid>
  );

  return (
    <Stack
      direction='column'
      spacing={2}
      sx={{
        pb: 10,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant='h6'>History</Typography>
        <FormControlLabel
          control={
            <Checkbox checked={showActiveOnly} size='small' onChange={(e) => setShowActiveOnly(e.target.checked)} />
          }
          label='Active Bots Only'
          sx={{ color: 'text.secondary' }}
        />
      </Box>
      <Paper
        elevation={1}
        sx={{
          width: '100%',
          pb: 4,
          backgroundColor: 'rgba(10, 12, 24, 0.50)', // slightly less translucent than parent (0.5)
          backdropFilter: 'blur(8px)',
        }}
      >
        <Box sx={{ width: '100%' }}>
          {/* Mobile: horizontally scrollable table for readability */}
          <Box
            sx={{
              display: 'block',
              [theme.breakpoints.up('md')]: {
                display: 'none',
              },
            }}
          >
            <TableContainer
              sx={{
                overflowX: 'auto',
                overflowY: 'visible',
              }}
            >
              <Table size='small' sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40 }} />
                    <TableCell>Pair</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell align='right'>Volume</TableCell>
                    <TableCell align='right'>Net Fees</TableCell>
                    <TableCell align='right'>MM PnL</TableCell>
                    <TableCell align='center'>Filled</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align='center'>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      hover
                      key={`mm-mobile-${r.id}`}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => handleOrderClick(r.id)}
                    >
                      <TableCell sx={{ width: 40, pl: 0.5, pr: 0.5 }}>
                        {Array.isArray(r.accounts) && r.accounts.length > 0 && (
                          <ExchangeVenueIcon
                            accountName={r.accounts[0]}
                            exchange={r.exchange}
                            getAccount={getAccount}
                            pair={r.pair}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant='body2'>{r.pair}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack
                          alignItems='center'
                          direction='row'
                          spacing={1}
                          sx={{ maxWidth: 140, overflow: 'hidden' }}
                        >
                          {Array.isArray(r.accounts) && r.accounts.length > 0 ? (
                            r.accounts.slice(0, 1).map((accountName) => {
                              // Use exchange from row data if available, otherwise fallback to account
                              const exchangeName = r.exchange || getAccount(accountName)?.exchangeName;
                              let displayAccount = accountName;
                              if (isWalletAddress(accountName)) {
                                displayAccount = insertEllipsis(accountName, 4, 4);
                              } else if (accountName.length > 14) {
                                displayAccount = `${accountName.substring(0, 14)}…`;
                              }
                              return (
                                <Stack alignItems='center' direction='row' key={`${r.id}-${accountName}`} spacing={0.5}>
                                  <ExchangeIcon exchangeName={exchangeName} style={{ height: 18, width: 18 }} />
                                  <Typography noWrap variant='body2'>
                                    {displayAccount}
                                  </Typography>
                                </Stack>
                              );
                            })
                          ) : (
                            <Typography variant='body2'>N/A</Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align='right'>${formatNumber(r.executed_notional)}</TableCell>
                      <TableCell align='right'>${formatNumber(r.netFees)}</TableCell>
                      <TableCell align='right'>
                        {r.mmPnLDollar === null ? (
                          '-'
                        ) : (
                          <Typography color={r.mmPnLDollar >= 0 ? 'success.main' : 'error.main'} variant='body2'>
                            {r.mmPnLDollar >= 0 ? '' : '-'}$
                            {r.mmPnLDollar === 0 ? '0.00' : formatNumber(Math.abs(r.mmPnLDollar))}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align='center'>
                        <Box sx={{ px: 1 }}>
                          <ProgressBar
                            containerStyleOverride={{ width: 70 }}
                            isDark={currentTheme === 'dark'}
                            isPov={false}
                            orderStatus={r.status}
                            progress={Math.round(Number(r.pct_filled || 0))}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography
                          color={(() => {
                            const c = getStatusColor(r.status);
                            switch (c) {
                              case 'success':
                                return 'success.main';
                              case 'error':
                                return 'error.main';
                              case 'warning':
                                return 'warning.main';
                              case 'info':
                                return 'info.main';
                              default:
                                return 'text.primary';
                            }
                          })()}
                          variant='body2'
                        >
                          {formatStatus(r.status)}
                        </Typography>
                      </TableCell>
                      <TableCell align='center'>
                        <Stack alignItems='center' direction='row' justifyContent='center' spacing={0.5}>
                          <IconButton
                            disabled={['COMPLETE', 'CANCELED', 'CANCELLED', 'FINISHER'].includes(r.status)}
                            size='small'
                            sx={{ color: theme.palette.error.main }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCancel(r.id, event);
                            }}
                          >
                            <CancelIcon fontSize='small' />
                          </IconButton>
                          <IconButton
                            size='small'
                            sx={{ color: theme.palette.primary.main }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleResubmit(r.id, event);
                            }}
                          >
                            <ReplayIcon fontSize='small' />
                          </IconButton>
                          {r.status === 'COMPLETE' && (
                            <IconButton
                              size='small'
                              sx={{ color: theme.palette.text.primary }}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleShareClick(r, event);
                              }}
                            >
                              <ShareIcon fontSize='small' />
                            </IconButton>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
          {/* Header + rows for md+ */}
          <Box
            sx={{
              display: 'none',
              [theme.breakpoints.up('md')]: {
                display: 'block',
              },
            }}
          >
            {renderHeader()}
            <Divider />
            <Box>
              {(() => {
                if (loading) {
                  return (
                    <>
                      {Array.from({ length: currentPageSize }).map((_, index) => {
                        const uniqueKey = `skeleton-${Math.random().toString(36).substr(2, 9)}-${index}`;
                        return (
                          <React.Fragment key={uniqueKey}>
                            {renderSkeletonRow(`skeleton-row-${uniqueKey}`)}
                            {index < currentPageSize - 1 && <Divider />}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                }
                if (rows.length === 0) {
                  return (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                      <Typography color='text.secondary' variant='body2'>
                        No market maker orders found.
                      </Typography>
                    </Box>
                  );
                }
                return (
                  <>
                    {rows.map((r, index) => (
                      <React.Fragment key={r.id}>
                        {renderRow(r)}
                        {index < rows.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </>
                );
              })()}
            </Box>
            <Divider />
          </Box>
          <Box
            alignItems='center'
            display='flex'
            justifyContent='space-between'
            sx={{
              p: 2,
              pb: {
                xs: 6,
                md: 2,
              },
            }}
          >
            <Typography color='text.secondary' variant='body2'>
              {typeof count === 'number' ? `${count} total` : ''}
            </Typography>
            <Pagination
              boundaryCount={1}
              color='primary'
              count={Math.max(1, Number(numPages) || 1)}
              page={Number(currentPageNumber) || 1}
              siblingCount={1}
              size='small'
              onChange={(_, p) => setCurrentPageNumber(p)}
            />
          </Box>
        </Box>
      </Paper>

      {/* Share Modal */}
      <MarketMakerShareableModal
        mmBotData={selectedMMBotData}
        open={shareModalOpen}
        showAlert={(alert) => {
          showToastMessage({
            type: alert.severity || 'info',
            message: alert.message,
          });
        }}
        onClose={() => {
          setShareModalOpen(false);
          setSelectedMMBotData(null);
        }}
      />
    </Stack>
  );
}
