import React from 'react';
import { Link, Stack, TableHead, Typography, Divider, useTheme } from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2/Grid2';
import { Loader } from '@/shared/Loader';
import { OrderSummaryAdditional, OrderSummaryBottomSection } from '@/shared/orderDetail/orderSummaryComponents';
import { FillExchangeChart, FillRoleChart } from '@/shared/orderDetail/charts';
import { OrderInfo, OrderInfoTypography } from '@/shared/orderDetail/OrderInfo';
import EmptyBar from '@/shared/components/EmptyBar';
import { createPairLink } from '@/shared/orderDetail/util/orderDetailUtils';

import {
  BASEURL,
  smartRound,
  calculateDurationDisplay,
  numberWithCommas,
  capitalizeFirstLetter,
  isEmpty,
} from '../../../util';

function DirectionalBiasValue({ bias }) {
  const biasNumber = Number(bias ?? 0);
  let biasLabel = 'Neutral';
  let biasColor = 'text.secondary';
  if (biasNumber > 0) {
    biasLabel = 'Long';
    biasColor = 'success.main';
  } else if (biasNumber < 0) {
    biasLabel = 'Short';
    biasColor = 'error.main';
  }
  return (
    <Stack alignItems='center' direction='row' spacing={0.5}>
      <Typography color={biasColor}>{biasLabel}</Typography>
      <Typography color='text.secondary' variant='caption'>
        ({biasNumber.toFixed(2)})
      </Typography>
    </Stack>
  );
}

function MultiSummary({ orderSummaryData, childOrders }) {
  const theme = useTheme();

  if (orderSummaryData === undefined || Object.keys(orderSummaryData).length === 0) {
    return <Loader />;
  }

  const splitOrdersBySide = (orders) => {
    return orders.reduce(
      (acc, order) => {
        if (order.side === 'buy') {
          acc.buyChildOrders.push(order);
        } else {
          acc.sellChildOrders.push(order);
        }
        return acc;
      },
      { buyChildOrders: [], sellChildOrders: [] }
    );
  };
  const { buyChildOrders, sellChildOrders } = splitOrdersBySide(childOrders);

  const {
    id,
    pairs,
    executed_notional,
    time_start,
    duration,
    strategy_params,
    strategy,
    schedule_discretion,
    engine_passiveness,
    alpha_tilt,
    directional_bias,
    pov_limit,
    limit_price_spread,
    exposure_tolerance,
    status,
    pct_filled,
    target_notional,
    order_condition_normal,
    order_condition_vars,
    order_variable_normal,
    fill_role_breakdown,
    fill_exchange_breakdown,
    custom_order_id,
  } = orderSummaryData;

  const calculateExecutedSpread = () => {
    if (isEmpty(buyChildOrders) || isEmpty(sellChildOrders)) return null;

    const buyExecPrice = buyChildOrders[0].executed_price;
    const sellExecPrice = sellChildOrders[0].executed_price;

    if (!buyExecPrice || !sellExecPrice) return null;

    const spreadDollars = sellExecPrice - buyExecPrice;
    const spreadBps = Math.log(sellExecPrice / buyExecPrice) * 10000;

    return {
      dollars: spreadDollars,
      bps: spreadBps,
    };
  };

  const executedSpread = calculateExecutedSpread();

  const createPairDisplay = (
    <Grid container spacing={2}>
      {!isEmpty(buyChildOrders) && (
        <Grid xs={6}>
          <Stack alignItems='center' direction='row' spacing={2}>
            <Divider
              flexItem
              orientation='vertical'
              sx={{
                borderColor: theme.palette.charts.greenTransparent,
              }}
            />
            <Stack direction='column' spacing={2}>
              {buyChildOrders.map((child) => {
                return createPairLink({
                  pairName: child.pair,
                  orderId: child.id,
                  CustomParent: 'div',
                });
              })}
            </Stack>
          </Stack>
        </Grid>
      )}
      <Grid xs={6}>
        <Stack alignItems='center' direction='row' spacing={2}>
          <Divider
            flexItem
            orientation='vertical'
            sx={{
              borderColor: theme.palette.charts.redTransparent,
            }}
          />
          <Stack direction='column' spacing={2}>
            {sellChildOrders.map((child) => {
              return createPairLink({
                pairName: child.pair,
                orderId: child.id,
                CustomParent: 'div',
              });
            })}
          </Stack>
        </Stack>
      </Grid>
    </Grid>
  );

  return (
    <Stack direction='column' spacing={2}>
      <Grid container spacing={3}>
        <Grid xs={12}>
          <OrderInfo
            header='Pairs'
            headerVariant='body2'
            sx={{
              fontSize: '0.75rem',
              fontWeight: 500,
              paddingTop: '12px',
              paddingBottom: '12px',
            }}
          >
            {createPairDisplay}
          </OrderInfo>
          <Divider sx={{ paddingTop: '8px' }} />
        </Grid>
        <Grid xs={6}>
          <OrderInfoTypography
            header='Executed Notional'
            value={`$${numberWithCommas(smartRound(executed_notional, 2))}`}
          />
        </Grid>
        <Grid xs={6}>
          <OrderInfoTypography
            header='Target Notional'
            value={target_notional ? `$${numberWithCommas(smartRound(target_notional, 2))}` : <EmptyBar />}
          />
        </Grid>
        <Grid xs={6}>
          <OrderInfoTypography header='Trajectory' value={strategy} />
        </Grid>
        <Grid xs={6}>
          <OrderInfoTypography header='Duration' value={calculateDurationDisplay(duration)} />
        </Grid>
        {Number.isFinite(limit_price_spread) && (
          <Grid xs={6}>
            <OrderInfoTypography
              header='Dynamic Limit Spread ($)'
              value={`${smartRound(Number(limit_price_spread))}`}
            />
          </Grid>
        )}
        {custom_order_id && (
          <Grid xs={6}>
            <OrderInfoTypography header='Custom Order ID' value={custom_order_id} />
          </Grid>
        )}
        {(() => {
          const es = executedSpread;
          if (!es) return null;
          return (
            <Grid xs={6}>
              <OrderInfoTypography
                header='Executed Spread'
                value={
                  <Stack direction='row' spacing={0.5}>
                    <Typography color={es.dollars >= 0 ? 'success.main' : 'error.main'}>
                      {es.dollars >= 0 ? '+' : '-'}${smartRound(Math.abs(es.dollars), 2)}
                    </Typography>
                    <Typography color='text.secondary' sx={{ paddingLeft: '8px' }} variant='caption'>
                      ≈ {smartRound(es.bps, 1)} bps
                    </Typography>
                  </Stack>
                }
              />
            </Grid>
          );
        })()}
      </Grid>

      <OrderSummaryAdditional
        alpha_tilt={alpha_tilt}
        directional_bias={directional_bias}
        engine_passiveness={engine_passiveness}
        exposure_tolerance={exposure_tolerance}
        max_otc={null}
        notes={null}
        order_condition_normal={order_condition_normal}
        order_condition_vars={order_condition_vars}
        order_variable_normal={order_variable_normal}
        pos_side={null}
        pov_limit={pov_limit}
        pov_target={null}
        resume_condition_normal={null}
        schedule_discretion={schedule_discretion}
        strategy_params={strategy_params}
      />

      <Divider />

      <OrderSummaryBottomSection
        isMultiView
        executed_notional={executed_notional}
        executed_price={null}
        market_type='multi'
        pct_filled={pct_filled}
        pov_limit={pov_limit}
        pov_target={null}
        status={status}
        time_start={time_start}
      />
      <div style={{ width: '100%' }}>
        <FillRoleChart data={fill_role_breakdown} height='32px' style={{ paddingRight: '4px' }} />
      </div>

      <div style={{ width: '100%', marginTop: '4px' }}>
        <FillExchangeChart data={fill_exchange_breakdown} height='32px' style={{ paddingRight: '4px' }} />
      </div>
    </Stack>
  );
}

export default MultiSummary;
