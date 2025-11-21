import React, { useEffect, useRef } from 'react';
import {
  Box,
  Grid,
  TextField,
  Typography,
  useTheme,
  FormControlLabel,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useAtom } from 'jotai';
import { useOrderForm } from '@/shared/context/OrderFormProvider';
import { NumericFormatCustom } from '@/shared/fields/NumberFieldFormat';
import BorderedStack from './AlgoOrderFieldsComponents/BorderedStack';
import { useMarketDataContext } from './MarketDataContext';
import { usePriceDataContext } from './PriceDataContext';
import ExitUrgencyPicker from './ExitUrgencyPicker';
import { formatPrice, msAndKs } from '../../../util';

const EXIT_INPUT_IDS = Object.freeze({
  TAKE_PROFIT_PERCENT: 'take-profit-percent',
  TAKE_PROFIT_PRICE: 'take-profit-price',
  STOP_LOSS_PERCENT: 'stop-loss-percent',
  STOP_LOSS_PRICE: 'stop-loss-price',
});

const getActiveInputId = () => (typeof document !== 'undefined' ? (document.activeElement?.id ?? null) : null);

function ExitConditionsFields({ FormAtoms }) {
  const theme = useTheme();
  const { marketSummaryMetrics } = useMarketDataContext();
  const { livePairPrice } = usePriceDataContext();
  const { selectedPair: contextSelectedPair } = useOrderForm();

  // Atoms for values
  const [takeProfitPrice, setTakeProfitPrice] = useAtom(FormAtoms.takeProfitPriceAtom);
  const [takeProfitPercentage, setTakeProfitPercentage] = useAtom(FormAtoms.takeProfitPercentageAtom);
  const [stopLossPrice, setStopLossPrice] = useAtom(FormAtoms.stopLossPriceAtom);
  const [stopLossPercentage, setStopLossPercentage] = useAtom(FormAtoms.stopLossPercentageAtom);

  const [takeProfitUrgency, setTakeProfitUrgency] = useAtom(FormAtoms.takeProfitUrgencyAtom);
  const [stopLossUrgency, setStopLossUrgency] = useAtom(FormAtoms.stopLossUrgencyAtom);
  const [selectedPairPrice] = useAtom(FormAtoms.selectedPairPriceAtom);
  const [selectedSide] = useAtom(FormAtoms.selectedSideAtom);
  const [selectedPair] = useAtom(FormAtoms.selectedPairAtom);
  const [selectedAccounts] = useAtom(FormAtoms.selectedAccountsAtom);
  const [baseQty] = useAtom(FormAtoms.baseQtyAtom);
  const [quoteQty] = useAtom(FormAtoms.quoteQtyAtom);

  // Refs to prevent infinite loops
  const isUpdatingTakeProfit = useRef(false);
  const isUpdatingStopLoss = useRef(false);

  // Helper to get current price - use real-time price from PriceDataContext if available, fallback to selectedPairPrice
  const currentPrice = parseFloat(livePairPrice) || parseFloat(selectedPairPrice?.price) || 0;
  const isBuy = selectedSide === 'buy';
  const isPairSelected = !!selectedPair;
  const isAccountSelected = selectedAccounts && selectedAccounts.length > 0;
  const isFormReady = isPairSelected && isAccountSelected;

  const clampTakeProfitPercentageNumber = (pct) => {
    if (!Number.isFinite(pct)) return pct;
    if (pct < 0) return 0;
    if (!isBuy && pct > 100) return 100;
    return pct;
  };

  const clampStopLossPercentageNumber = (pct) => {
    if (!Number.isFinite(pct)) return pct;
    if (pct < 0) return 0;
    if (isBuy && pct > 100) return 100;
    return pct;
  };

  // Calculate estimated profit/loss
  const calculateEstimatedProfit = () => {
    if (!takeProfitPrice || !currentPrice) return null;
    const tpPrice = parseFloat(takeProfitPrice);
    if (Number.isNaN(tpPrice)) return null;

    // Use quoteQty if available, otherwise use baseQty converted to quote
    let quantity = parseFloat(quoteQty);
    if (!quantity || Number.isNaN(quantity)) {
      // If quoteQty is not available, try to use baseQty
      const baseQuantity = parseFloat(baseQty);
      if (baseQuantity && !Number.isNaN(baseQuantity) && currentPrice > 0) {
        quantity = baseQuantity * currentPrice;
      } else {
        return null;
      }
    }

    const perUnitProfit = isBuy ? tpPrice - currentPrice : currentPrice - tpPrice;
    const profitInQuote = perUnitProfit * (quantity / currentPrice);
    return Math.round(profitInQuote);
  };

  const calculateEstimatedLoss = () => {
    if (!stopLossPrice || !currentPrice) return null;
    const slPrice = parseFloat(stopLossPrice);
    if (Number.isNaN(slPrice)) return null;

    // Use quoteQty if available, otherwise use baseQty converted to quote
    let quantity = parseFloat(quoteQty);
    if (!quantity || Number.isNaN(quantity)) {
      // If quoteQty is not available, try to use baseQty
      const baseQuantity = parseFloat(baseQty);
      if (baseQuantity && !Number.isNaN(baseQuantity) && currentPrice > 0) {
        quantity = baseQuantity * currentPrice;
      } else {
        return null;
      }
    }

    const perUnitLoss = isBuy ? currentPrice - slPrice : slPrice - currentPrice;
    const lossInQuote = perUnitLoss * (quantity / currentPrice);
    return Math.round(lossInQuote);
  };

  // Normal cumulative distribution function (approximation)
  const normalCDF = (z) => {
    // Abramowitz and Stegun approximation
    const p = 0.2316419;
    const b1 = 0.31938153;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;

    const t = 1 / (1 + p * Math.abs(z));
    const cdf =
      1 -
      (1 / Math.sqrt(2 * Math.PI)) *
        Math.exp((-z * z) / 2) *
        (b1 * t + b2 * t * t + b3 * t * t * t + b4 * t * t * t * t + b5 * t * t * t * t * t);

    return z >= 0 ? cdf : 1 - cdf;
  };

  // Calculate % chance of 24h fill using Bayesian probability based on Brownian motion
  const calculateFillChance = (targetPrice) => {
    if (!targetPrice || !currentPrice) return null;
    const price = parseFloat(targetPrice);
    if (Number.isNaN(price)) return null;

    const distance = Math.abs(price - currentPrice);
    const distancePercent = (distance / currentPrice) * 100;

    // Get 1h volatility (annualized), fallback to 24h price change if not available
    const hourlyVolatility = marketSummaryMetrics.priceVolatility || Math.abs(marketSummaryMetrics.priceDiff) || 1;

    if (distancePercent === 0) return 100;

    // Convert 1h projected volatility to daily volatility
    // The hourlyVolatility is already annualized and projected for 1 hour
    // To get daily volatility: daily = hourly * sqrt(24)
    const dailyVolatility = hourlyVolatility * Math.sqrt(24);

    // For a 24-hour period, the standard deviation is daily volatility
    // Using normal distribution: P(X > target) = 1 - P(X <= target)
    // For Brownian motion, the probability of reaching a certain distance in 24h
    // follows a normal distribution with mean = current price, std = daily volatility

    // Convert distance to number of standard deviations
    const zScore = distancePercent / dailyVolatility;

    // Calculate probability using normal distribution
    // For a two-sided test (price can go up or down), we use the complementary probability
    // P(reach target) = 2 * (1 - P(X <= zScore))
    const probability = 2 * (1 - normalCDF(zScore));
    return Math.min(100, Math.max(0, probability * 100));
  };

  // Helper functions to check if prices are valid
  const isTakeProfitPriceValid = () => {
    if (!takeProfitPrice || !currentPrice) return true;
    const price = parseFloat(takeProfitPrice);
    if (Number.isNaN(price)) return true; // Allow typing
    if (isBuy) {
      return price >= currentPrice; // Buy: take profit should be >= current price
    }
    return price >= 0 && price <= currentPrice; // Sell: take profit should be 0 <= price <= current price
  };

  const isStopLossPriceValid = () => {
    if (!stopLossPrice || !currentPrice) return true;
    const price = parseFloat(stopLossPrice);
    if (Number.isNaN(price)) return true; // Allow typing
    if (isBuy) {
      return price >= 0 && price <= currentPrice; // Buy: stop loss should be 0 <= price <= current price
    }
    return price >= currentPrice; // Sell: stop loss should be >= current price
  };

  // Helper function to format price for display (for profit/loss, not input fields)
  const formatPriceValue = (price) => {
    if (!price) return '';
    const priceNum = parseFloat(price);
    if (Number.isNaN(priceNum)) return price;
    // Use formatPrice for consistent formatting with pair info bar, then add commas
    const formattedPrice = formatPrice(priceNum);
    return formattedPrice.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Exit input coordination summary:
  // - Users can freely type or paste partial numeric strings into either price or percentage fields; clearing one clears the other.
  // - The field in focus is treated as the source of truth, so we only derive its counterpart when the user is typing elsewhere.
  // - Programmatic updates (side toggles, live price refreshes, template loads) continually re-sync prices from stored percentages,
  //   but only when the relevant price box is not focused to avoid interrupting active edits.
  // - Take profit and stop loss share the same rounding rules (two decimals) and validation so both behave identically.

  // Coordination: when % changes, update price
  useEffect(() => {
    if (!currentPrice) return;
    if (isUpdatingTakeProfit.current) return;
    const activeInputId = getActiveInputId();
    if (takeProfitPercentage !== '' && activeInputId === EXIT_INPUT_IDS.TAKE_PROFIT_PERCENT) {
      isUpdatingTakeProfit.current = true;
      const pct = parseFloat(takeProfitPercentage);
      if (!Number.isNaN(pct)) {
        const boundedPct = clampTakeProfitPercentageNumber(pct);
        if (boundedPct !== pct) {
          setTakeProfitPercentage(boundedPct.toString());
        }
        const price = isBuy ? currentPrice * (1 + boundedPct / 100) : currentPrice * (1 - boundedPct / 100);
        setTakeProfitPrice(price.toFixed(2));
      }
      setTimeout(() => {
        isUpdatingTakeProfit.current = false;
      }, 0);
    }
    // eslint-disable-next-line
  }, [takeProfitPercentage, currentPrice, isBuy]);

  useEffect(() => {
    if (!currentPrice) return;
    if (isUpdatingStopLoss.current) return;
    const activeInputId = getActiveInputId();
    if (stopLossPercentage !== '' && activeInputId === EXIT_INPUT_IDS.STOP_LOSS_PERCENT) {
      isUpdatingStopLoss.current = true;
      const pct = parseFloat(stopLossPercentage);
      if (!Number.isNaN(pct)) {
        const boundedPct = clampStopLossPercentageNumber(pct);
        if (boundedPct !== pct) {
          setStopLossPercentage(boundedPct.toString());
        }
        const priceMultiplier = isBuy ? Math.max(0, 1 - boundedPct / 100) : 1 + boundedPct / 100;
        const price = currentPrice * priceMultiplier;
        setStopLossPrice(price.toFixed(2));
      }
      setTimeout(() => {
        isUpdatingStopLoss.current = false;
      }, 0);
    }
    // eslint-disable-next-line
  }, [stopLossPercentage, currentPrice, isBuy]);

  // Coordination: when price changes, update %
  useEffect(() => {
    if (!currentPrice) return;
    if (isUpdatingTakeProfit.current) return;
    const activeInputId = getActiveInputId();
    if (takeProfitPrice !== '' && activeInputId === EXIT_INPUT_IDS.TAKE_PROFIT_PRICE) {
      isUpdatingTakeProfit.current = true;
      const price = parseFloat(takeProfitPrice);
      if (!Number.isNaN(price) && currentPrice !== 0) {
        const pct = isBuy ? (price / currentPrice - 1) * 100 : (1 - price / currentPrice) * 100;
        const boundedPct = clampTakeProfitPercentageNumber(pct);
        setTakeProfitPercentage(boundedPct.toFixed(2));
      }
      setTimeout(() => {
        isUpdatingTakeProfit.current = false;
      }, 0);
    }
    // eslint-disable-next-line
  }, [takeProfitPrice, currentPrice, isBuy]);

  useEffect(() => {
    if (!currentPrice) return;
    if (isUpdatingStopLoss.current) return;
    const activeInputId = getActiveInputId();
    if (stopLossPrice !== '' && activeInputId === EXIT_INPUT_IDS.STOP_LOSS_PRICE) {
      isUpdatingStopLoss.current = true;
      const price = parseFloat(stopLossPrice);
      if (!Number.isNaN(price) && currentPrice !== 0) {
        const pct = isBuy ? (1 - price / currentPrice) * 100 : (price / currentPrice - 1) * 100;
        const boundedPct = clampStopLossPercentageNumber(pct);
        setStopLossPercentage(boundedPct.toFixed(2));
      }
      setTimeout(() => {
        isUpdatingStopLoss.current = false;
      }, 0);
    }
    // eslint-disable-next-line
  }, [stopLossPrice, currentPrice, isBuy]);

  // Recalculate prices when side changes
  useEffect(() => {
    if (!currentPrice) return;
    const activeInputId = getActiveInputId();

    // Recalculate take profit price if percentage exists
    if (takeProfitPercentage !== '' && activeInputId !== EXIT_INPUT_IDS.TAKE_PROFIT_PRICE) {
      const pct = parseFloat(takeProfitPercentage);
      if (!Number.isNaN(pct)) {
        const boundedPct = clampTakeProfitPercentageNumber(pct);
        if (boundedPct !== pct) {
          setTakeProfitPercentage(boundedPct.toString());
        }
        const price = isBuy ? currentPrice * (1 + boundedPct / 100) : currentPrice * (1 - boundedPct / 100);
        setTakeProfitPrice(price.toFixed(2));
      }
    }

    // Recalculate stop loss price if percentage exists
    if (stopLossPercentage !== '' && activeInputId !== EXIT_INPUT_IDS.STOP_LOSS_PRICE) {
      const pct = parseFloat(stopLossPercentage);
      if (!Number.isNaN(pct)) {
        const boundedPct = clampStopLossPercentageNumber(pct);
        if (boundedPct !== pct) {
          setStopLossPercentage(boundedPct.toString());
        }
        const priceMultiplier = isBuy ? Math.max(0, 1 - boundedPct / 100) : 1 + boundedPct / 100;
        const price = currentPrice * priceMultiplier;
        setStopLossPrice(price.toFixed(2));
      }
    }
    // eslint-disable-next-line
  }, [isBuy, currentPrice]);

  // Auto-update prices when live price changes (only if percentages are set)
  useEffect(() => {
    if (!currentPrice) return;
    const activeInputId = getActiveInputId();

    // Only update if the user has set percentages and we're not currently updating
    if (
      takeProfitPercentage !== '' &&
      !isUpdatingTakeProfit.current &&
      activeInputId !== EXIT_INPUT_IDS.TAKE_PROFIT_PRICE
    ) {
      const pct = parseFloat(takeProfitPercentage);
      if (!Number.isNaN(pct)) {
        const boundedPct = clampTakeProfitPercentageNumber(pct);
        if (boundedPct !== pct) {
          setTakeProfitPercentage(boundedPct.toString());
        }
        const price = isBuy ? currentPrice * (1 + boundedPct / 100) : currentPrice * (1 - boundedPct / 100);
        setTakeProfitPrice(price.toFixed(2));
      }
    }

    if (stopLossPercentage !== '' && !isUpdatingStopLoss.current && activeInputId !== EXIT_INPUT_IDS.STOP_LOSS_PRICE) {
      const pct = parseFloat(stopLossPercentage);
      if (!Number.isNaN(pct)) {
        const boundedPct = clampStopLossPercentageNumber(pct);
        if (boundedPct !== pct) {
          setStopLossPercentage(boundedPct.toString());
        }
        const priceMultiplier = isBuy ? Math.max(0, 1 - boundedPct / 100) : 1 + boundedPct / 100;
        const price = currentPrice * priceMultiplier;
        setStopLossPrice(price.toFixed(2));
      }
    }
    // eslint-disable-next-line
  }, [livePairPrice, isBuy, takeProfitPercentage, stopLossPercentage]);

  return (
    <Grid container spacing={1}>
      {/* Take Profit Section */}
      <Grid sx={{ pl: 1, pb: 2, mt: 2 }} xs={12}>
        <BorderedStack spacing={1} sx={{ padding: '15px' }} title='Take Profit' titleColor='green'>
          <Grid container alignItems='center' spacing={1}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                disabled={!isFormReady}
                id='take-profit-percent'
                InputLabelProps={{
                  sx: {
                    color: !isFormReady ? theme.palette.text.disabled : undefined,
                  },
                }}
                InputProps={{
                  endAdornment: <Box component='span'>%</Box>,
                  inputComponent: NumericFormatCustom,
                  inputProps: {
                    inputMode: 'decimal',
                    min: 0,
                    step: 'any',
                    isAllowed: (values) => {
                      const { floatValue } = values;
                      if (floatValue === undefined) return true;
                      if (floatValue < 0) return false;
                      if (!isBuy && floatValue > 100) return false;
                      return true;
                    },
                  },
                  sx: {
                    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                      display: 'none',
                    },
                    '& input[type=number]': {
                      MozAppearance: 'textfield',
                    },
                  },
                }}
                label='Take Profit %'
                size='small'
                value={takeProfitPercentage}
                onChange={(e) => {
                  const { value } = e.target;
                  if (Number.isNaN(parseFloat(value))) {
                    setTakeProfitPercentage(value);
                    // If percentage is cleared, also clear price
                    if (value === '') {
                      setTakeProfitPrice('');
                    }
                  } else {
                    // For buy orders: floor at 0, no cap
                    // For sell orders: floor at 0, cap at 100
                    const cappedValue = isBuy
                      ? Math.max(0, parseFloat(value))
                      : Math.max(0, Math.min(100, parseFloat(value)));
                    setTakeProfitPercentage(cappedValue.toString());
                  }
                }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                disabled={!isFormReady}
                id='take-profit-price'
                InputLabelProps={{
                  sx: {
                    color: !isFormReady ? theme.palette.text.disabled : undefined,
                  },
                }}
                InputProps={{
                  startAdornment: <Box component='span'>$</Box>,
                  inputComponent: NumericFormatCustom,
                  inputProps: {
                    inputMode: 'decimal',
                    step: 'any',
                  },
                  sx: {
                    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                      display: 'none',
                    },
                    '& input[type=number]': {
                      MozAppearance: 'textfield',
                    },
                    ...(isTakeProfitPriceValid()
                      ? {}
                      : {
                          '& .MuiInputBase-input': {
                            color: theme.palette.error.main,
                          },
                          '& .MuiInputLabel-root': {
                            color: theme.palette.error.main,
                          },
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': {
                              borderColor: theme.palette.error.main,
                            },
                            '&:hover fieldset': {
                              borderColor: theme.palette.error.main,
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: theme.palette.error.main,
                            },
                          },
                        }),
                  },
                }}
                label='Take Profit Price'
                size='small'
                value={takeProfitPrice}
                onChange={(e) => {
                  const { value } = e.target;
                  if (value === '') {
                    setTakeProfitPrice('');
                    setTakeProfitPercentage('');
                  } else {
                    setTakeProfitPrice(value);
                  }
                }}
              />
            </Grid>
          </Grid>
          <Grid container alignItems='center' spacing={1} sx={{ mt: 1 }}>
            <Grid item xs={6}>
              <Typography
                color={
                  calculateEstimatedProfit() !== null && calculateEstimatedProfit() !== 0
                    ? 'success.main'
                    : 'textSecondary'
                }
                variant='body2'
              >
                {calculateEstimatedProfit() !== null ? `~$${msAndKs(calculateEstimatedProfit(), 2)}` : 'N/A'} Max Profit
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color='textSecondary' variant='body2'>
                {calculateFillChance(takeProfitPrice) !== null
                  ? `${calculateFillChance(takeProfitPrice).toFixed(2)}%`
                  : 'N/A'}{' '}
                Chance of 24h Fill
              </Typography>
            </Grid>
          </Grid>

          {/* Exit Condition Urgency Selector */}
          <Grid container alignItems='center' spacing={1} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <ExitUrgencyPicker
                disabled={!isFormReady}
                setUrgency={setTakeProfitUrgency}
                urgency={takeProfitUrgency}
              />
            </Grid>
          </Grid>
        </BorderedStack>
      </Grid>

      {/* Stop Loss Section */}
      <Grid sx={{ pl: 1, pb: 2, mt: 2 }} xs={12}>
        <BorderedStack spacing={1} sx={{ padding: '15px' }} title='Stop Loss' titleColor='red'>
          <Grid container alignItems='center' spacing={1}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                disabled={!isFormReady}
                id='stop-loss-percent'
                InputLabelProps={{
                  sx: {
                    color: !isFormReady ? theme.palette.text.disabled : undefined,
                  },
                }}
                InputProps={{
                  endAdornment: <Box component='span'>%</Box>,
                  inputComponent: NumericFormatCustom,
                  inputProps: {
                    inputMode: 'decimal',
                    min: 0,
                    step: 'any',
                    ...(isBuy ? { max: 100 } : {}),
                    isAllowed: (values) => {
                      const { floatValue } = values;
                      if (floatValue === undefined) return true;
                      if (floatValue < 0) return false;
                      if (isBuy && floatValue > 100) return false;
                      return true;
                    },
                  },
                  sx: {
                    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                      display: 'none',
                    },
                    '& input[type=number]': {
                      MozAppearance: 'textfield',
                    },
                  },
                }}
                label='Stop Loss %'
                size='small'
                value={stopLossPercentage}
                onChange={(e) => {
                  const { value } = e.target;
                  if (Number.isNaN(parseFloat(value))) {
                    setStopLossPercentage(value);
                    // If percentage is cleared, also clear price
                    if (value === '') {
                      setStopLossPrice('');
                    }
                  } else {
                    // For buy orders: floor at 0, cap at 100
                    // For sell orders: floor at 0, no cap
                    const cappedValue = isBuy
                      ? Math.max(0, Math.min(100, parseFloat(value)))
                      : Math.max(0, parseFloat(value));
                    setStopLossPercentage(cappedValue.toString());
                  }
                }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                disabled={!isFormReady}
                id='stop-loss-price'
                InputLabelProps={{
                  sx: {
                    color: !isFormReady ? theme.palette.text.disabled : undefined,
                  },
                }}
                InputProps={{
                  startAdornment: <Box component='span'>$</Box>,
                  inputComponent: NumericFormatCustom,
                  inputProps: {
                    inputMode: 'decimal',
                    step: 'any',
                  },
                  sx: {
                    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                      display: 'none',
                    },
                    '& input[type=number]': {
                      MozAppearance: 'textfield',
                    },
                    ...(isStopLossPriceValid()
                      ? {}
                      : {
                          '& .MuiInputBase-input': {
                            color: theme.palette.error.main,
                          },
                          '& .MuiInputLabel-root': {
                            color: theme.palette.error.main,
                          },
                          '& .MuiOutlinedInput-root': {
                            '& fieldset': {
                              borderColor: theme.palette.error.main,
                            },
                            '&:hover fieldset': {
                              borderColor: theme.palette.error.main,
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: theme.palette.error.main,
                            },
                          },
                        }),
                  },
                }}
                label='Stop Loss Price'
                size='small'
                value={stopLossPrice}
                onChange={(e) => {
                  const { value } = e.target;
                  if (value === '') {
                    setStopLossPrice('');
                    setStopLossPercentage('');
                  } else {
                    setStopLossPrice(value);
                  }
                }}
              />
            </Grid>
          </Grid>

          <Grid container alignItems='center' spacing={1} sx={{ mt: 1 }}>
            <Grid item xs={6}>
              <Typography
                color={
                  calculateEstimatedLoss() !== null && calculateEstimatedLoss() > 0 ? 'error.main' : 'textSecondary'
                }
                variant='body2'
              >
                {calculateEstimatedLoss() !== null ? `~$${msAndKs(calculateEstimatedLoss(), 2)}` : 'N/A'} Max Loss
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color='textSecondary' variant='body2'>
                {calculateFillChance(stopLossPrice) !== null
                  ? `${calculateFillChance(stopLossPrice).toFixed(2)}%`
                  : 'N/A'}{' '}
                Chance of 24h Fill
              </Typography>
            </Grid>
          </Grid>

          {/* Exit Condition Urgency Selector */}
          <Grid container alignItems='center' spacing={1} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <ExitUrgencyPicker disabled={!isFormReady} setUrgency={setStopLossUrgency} urgency={stopLossUrgency} />
            </Grid>
          </Grid>
        </BorderedStack>
      </Grid>
    </Grid>
  );
}

export default ExitConditionsFields;
