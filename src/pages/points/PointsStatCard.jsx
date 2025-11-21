import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import LabelTooltip from '@/shared/components/LabelTooltip';

function PointsStatCard({ label, value, tooltip, description, secondaryValue, secondaryValueColor, plain = false }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundColor: plain ? 'transparent' : 'rgba(255, 255, 255, 0.03)',
        border: plain ? '0px solid transparent' : '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        height: '100%',
        p: 1.5,
        position: secondaryValue ? 'relative' : 'static',
      }}
    >
      <Box sx={{ mb: 0.5 }}>
        {tooltip ? (
          <LabelTooltip color='text.secondary' label={label} labelTextVariant='body2' title={tooltip} />
        ) : (
          <Typography sx={{ color: theme.palette.text.secondary }} variant='body2'>
            {label}
          </Typography>
        )}
      </Box>
      <Typography variant='h5'>{value}</Typography>
      {secondaryValue && (
        <Typography
          sx={{
            color: secondaryValueColor || theme.palette.success.main,
            fontSize: '0.55rem',
            fontWeight: 400,
            position: 'absolute',
            right: 16,
            top: 16,
            lineHeight: 1.2,
          }}
          variant='caption'
        >
          {secondaryValue}
        </Typography>
      )}
      {description ? (
        <Typography sx={{ color: theme.palette.text.secondary }} variant='body2'>
          {description}
        </Typography>
      ) : null}
    </Box>
  );
}

export default PointsStatCard;
