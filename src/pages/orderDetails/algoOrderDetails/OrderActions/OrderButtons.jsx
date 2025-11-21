import { Box, Button, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import React, { useState } from 'react';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PauseCircleOutlineOutlinedIcon from '@mui/icons-material/PauseCircleOutlineOutlined';
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import { useUserMetadata } from '../../../../shared/context/UserMetadataProvider';

const buttonColor = (isDisabled) => {
  return isDisabled ? 'text.disabled' : 'primary';
};

export function AmendButton({ status, setAmendDialogOpen, parentOrder }) {
  const { isDev } = useUserMetadata();
  const amendDisabledTooltipMessage = () => {
    if (status === 'COMPLETE' || status === 'CANCELED') {
      return 'Order has terminated.';
    }

    if (parentOrder) {
      return 'Cannot amend child orders.';
    }

    return '';
  };

  // easier testing in dev
  const isDisabled = status === 'COMPLETE' || status === 'CANCELED' || (!!parentOrder && !isDev);

  return (
    <Tooltip title={amendDisabledTooltipMessage()}>
      <Box width='25%'>
        <Button
          fullWidth
          aria-label='amend'
          color='primary'
          disabled={isDisabled}
          size='small'
          startIcon={<EditOutlinedIcon />}
          variant='text'
          onClick={(event) => {
            event.stopPropagation();
            setAmendDialogOpen(true);
          }}
        >
          <Typography color={buttonColor(isDisabled)} variant='button1'>
            Amend
          </Typography>
        </Button>
      </Box>
    </Tooltip>
  );
}

const pauseDisabledTooltipMessage = (
  isPauseDisabled,
  isOOLPaused,
  status,
  super_strategy_name,
  parent_order,
  allowPauseWhenCanceled,
  maintenanceModeEnabled
) => {
  if (!isPauseDisabled) {
    return '';
  }

  if (isOOLPaused) {
    return 'Resume is disabled because order is OOL. The order will automatically resume when the market price is within range.';
  }

  if (status === 'COMPLETE' || (status === 'CANCELED' && !allowPauseWhenCanceled)) {
    return 'Order has terminated.';
  }

  if (super_strategy_name === 'Target Time') {
    return 'Cannot pause orders with Target Time strategy.';
  }

  if (parent_order) {
    return 'Please pause from parent order page.';
  }

  if (maintenanceModeEnabled) {
    return 'Pause is disabled in maintenance mode.';
  }

  return '';
};

const renderPauseResumeText = (isPaused, isPauseDisabled) =>
  isPaused ? (
    <Typography color={buttonColor(isPauseDisabled)} variant='button1'>
      Resume{' '}
    </Typography>
  ) : (
    <Typography color={buttonColor(isPauseDisabled)} variant='button1'>
      Pause
    </Typography>
  );

export function PauseResumeButton({
  status,
  isPaused,
  isOOLPaused,
  parent_order,
  super_strategy_name,
  setHandleConfirm,
  setConfirmModalText,
  setConfirmModalOpen,
  handlePause,
  handleResume,
  maintenanceModeEnabled,
  allowPauseWhenCanceled = false,
}) {
  const isPauseDisabled =
    isOOLPaused ||
    status === 'COMPLETE' ||
    (status === 'CANCELED' && !allowPauseWhenCanceled) ||
    super_strategy_name === 'Target Time' ||
    !!parent_order ||
    maintenanceModeEnabled;
  return (
    <Tooltip
      title={pauseDisabledTooltipMessage(
        isPauseDisabled,
        isOOLPaused,
        status,
        super_strategy_name,
        parent_order,
        allowPauseWhenCanceled,
        maintenanceModeEnabled
      )}
    >
      <Box sx={{ width: '25%' }}>
        <Button
          fullWidth
          aria-label='pause'
          color='primary'
          disabled={isPauseDisabled}
          size='small'
          startIcon={isPaused ? <PlayCircleOutlineOutlinedIcon /> : <PauseCircleOutlineOutlinedIcon />}
          variant='text'
          onClick={(event) => {
            event.stopPropagation();
            setHandleConfirm(() => (isPaused ? handleResume : handlePause));
            setConfirmModalText(`Are you sure you want to ${isPaused ? 'resume' : 'pause'} this order?`);
            setConfirmModalOpen(true);
          }}
        >
          {renderPauseResumeText(isPaused, isPauseDisabled)}
        </Button>
      </Box>
    </Tooltip>
  );
}

const cancelDisabledTooltipMessage = (status, parentOrder) => {
  if (status === 'COMPLETE' || status === 'CANCELED') {
    return 'Order has terminated.';
  }

  if (parentOrder) {
    return 'Cannot cancel child orders.';
  }

  return '';
};

export function CancelButton({
  status,
  setHandleConfirm,
  setConfirmModalText,
  setConfirmModalOpen,
  handleCancel,
  parentOrder,
}) {
  const isCancelDisabled = status === 'COMPLETE' || status === 'CANCELED' || !!parentOrder;

  return (
    <Tooltip title={cancelDisabledTooltipMessage(status, parentOrder)}>
      <Box sx={{ width: '25%' }}>
        <Button
          fullWidth
          aria-label='cancel'
          color='primary'
          disabled={isCancelDisabled}
          size='small'
          startIcon={<CancelOutlinedIcon />}
          variant='text'
          onClick={(event) => {
            event.stopPropagation();
            setConfirmModalText('Are you sure you want to cancel this order?');
            setHandleConfirm(() => handleCancel);
            setConfirmModalOpen(true);
          }}
        >
          <Typography color={buttonColor(isCancelDisabled)} variant='button1'>
            Cancel
          </Typography>
        </Button>
      </Box>
    </Tooltip>
  );
}

export function ResubmitButton({ handleResubmit, handleResubmitRemaining, maintenanceModeEnabled }) {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleClose = () => {
    setAnchorEl(null);
  };

  const isDisabled = maintenanceModeEnabled;

  return (
    <Tooltip title={isDisabled ? 'Resubmit is disabled in maintenance mode.' : ''}>
      <Box sx={{ width: '25%' }}>
        <Button
          fullWidth
          aria-label='resubmit_order_action'
          color='primary'
          disabled={isDisabled}
          size='small'
          startIcon={<ReplayOutlinedIcon />}
          variant='text'
          onClick={(event) => {
            event.stopPropagation();
            setAnchorEl(event.currentTarget);
          }}
        >
          <Typography color={buttonColor(isDisabled)} variant='button1'>
            Resubmit
          </Typography>
        </Button>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
          <MenuItem
            onClick={() => {
              handleResubmitRemaining();
              handleClose();
            }}
          >
            <Typography variant='button1'>Resubmit Remaining Order</Typography>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleResubmit();
              handleClose();
            }}
          >
            <Typography variant='button1'>Resubmit Entire Order</Typography>
          </MenuItem>
        </Menu>
      </Box>
    </Tooltip>
  );
}
