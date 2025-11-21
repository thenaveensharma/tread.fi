import React, { useState, useMemo, useEffect, useContext, useRef, useCallback } from 'react';
import {
  Box,
  Container,
  Stack,
  Tabs,
  Tab,
  Typography,
  useTheme,
  Paper,
  Button,
  Skeleton,
  SvgIcon,
  Divider,
  GlobalStyles,
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2/Grid2';
import LooksOneIcon from '@mui/icons-material/LooksOne';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import ArticleIcon from '@mui/icons-material/Article';
import VolumeBoostIcons from '@images/volume_boost_icons';
import useGetPointsData from '@/pages/points/hooks/useGetPointsData';
import { DateRange } from '@/pages/points/DateRangePicker';
import { smartRound, numberWithCommas, msAndKs } from '@/util';
import DataComponent from '@/shared/DataComponent';
import ExchangeIcons from '@images/exchange_icons';
import PointsTableSeason1 from '@/pages/points/PointsTableSeason1';
import PointsLoadingMask from '@/pages/points/PointsLoadingMask';
import PointsStatCard from '@/pages/points/PointsStatCard';
import PointsBuffCard from '@/pages/points/PointsBuffCard';
import PointsWeeklyProgressCard from '@/pages/points/PointsWeeklyProgressCard';
import WeeklyVolumeProgress from '@/pages/points/WeeklyVolumeProgress';
import CountUp from '@/shared/components/CountUp';
import LOGOS from '@images/logos';
import moment from 'moment';
import { alpha } from '@mui/material/styles';
import { isolatedHolographicStyles } from '@/theme/holographicEffects';
import { ErrorContext } from '@/shared/context/ErrorProvider';
import { ApiError, getPointsData } from '@/apiServices';
import BackgroundAnimationWrapper, {
  useBackgroundAnimation,
  BackgroundToggle,
} from '@/shared/components/BackgroundAnimationWrapper';
import FaultyTerminal from '@/shared/components/FaultyTerminal';

// Custom icon wrapper components for volume boost icons
// These wrap the SVG images as components that accept sx props
function VolumeBoostIcon1({ sx, ...props }) {
  return (
    <Box
      alt='Level 1'
      component='img'
      src={VolumeBoostIcons.level1}
      {...props}
      sx={{
        width: 24,
        height: 24,
        ...sx,
      }}
    />
  );
}

function VolumeBoostIcon2({ sx, ...props }) {
  return (
    <Box
      alt='Level 2'
      component='img'
      src={VolumeBoostIcons.level2}
      {...props}
      sx={{
        width: 24,
        height: 24,
        ...sx,
      }}
    />
  );
}

function VolumeBoostIcon3({ sx, ...props }) {
  return (
    <Box
      alt='Level 3'
      component='img'
      src={VolumeBoostIcons.level3}
      {...props}
      sx={{
        width: 24,
        height: 24,
        ...sx,
      }}
    />
  );
}

// Volume boost levels configuration
const VOLUME_BOOST_LEVELS = [
  {
    level: 1,
    threshold: 1000000, // $1M
    multiplier: '1.10X',
    percentage: 10,
    multiplierValue: 1.1,
    description: 'Gain an additional 10% boost in volume generated—each dollar traded counts as $1.10 in volume.',
    icon: VolumeBoostIcon1,
  },
  {
    level: 2,
    threshold: 5000000, // $5M
    multiplier: '1.20X',
    percentage: 20,
    multiplierValue: 1.2,
    description: 'Gain an additional 20% boost in volume generated—each dollar traded counts as $1.20 in volume.',
    icon: VolumeBoostIcon2,
  },
  {
    level: 3,
    threshold: 10000000, // $10M
    multiplier: '1.30X',
    percentage: 30,
    multiplierValue: 1.3,
    description: 'Gain an additional 30% boost in volume generated—each dollar traded counts as $1.30 in volume.',
    icon: VolumeBoostIcon3,
  },
];

// Legacy VOLUME_LEVELS for progress bar (keeping for compatibility)
// Note: These values must match VOLUME_BOOST_LEVELS for consistency
const VOLUME_LEVELS = [
  { threshold: 1000000, label: '1.10X', percentage: 10 },
  { threshold: 5000000, label: '1.20X', percentage: 20 },
  { threshold: 10000000, label: '1.30X', percentage: 30 },
];

const VOLUME_LEVEL_COLOR_MAP = {
  1: '#cd7f32', // Bronze
  2: '#c0c0c0', // Silver
  3: '#d4af37', // Gold
};

const BOOST_CARD_MIN_HEIGHT = {
  exchange: 100,
  volume: 110,
};

const EXCHANGE_COLOR_CONFIG = {
  bybit: { variant: 'neutral' },
  hyperliquid: { variant: 'neutral' },
  okxdex: { variant: 'holographic' },
};

const createHolographicGradient = (primaryAlpha = 0.32, secondaryAlpha = 0.22) =>
  `linear-gradient(135deg, rgba(139, 92, 246, ${primaryAlpha}) 0%, rgba(59, 130, 246, ${secondaryAlpha}) 33%, rgba(34, 197, 94, ${primaryAlpha}) 66%, rgba(244, 114, 182, ${secondaryAlpha}) 100%)`;

// Season 1 start date: Monday, November 3rd, 2025
const SEASON_1_START_DATE = moment.utc('2025-11-03').startOf('day');

function NoPointsActivity() {
  return (
    <Stack
      alignItems='center'
      direction='column'
      justifyContent='center'
      spacing={2}
      sx={{ height: '100%', minHeight: 'inherit' }}
    >
      <img alt='Tread Logo' src={LOGOS.treadRoundedSvg} style={{ height: '64px' }} />
      <Typography variant='h6'>You don&apos;t have any points rewards right now</Typography>
      <Button href='/' size='large' variant='contained'>
        Go to trade
      </Button>
    </Stack>
  );
}

function PointsPageSeason1() {
  const theme = useTheme();
  const { showAlert } = useContext(ErrorContext);
  const [activeTab, setActiveTab] = useState(0); // 0 = Points, 1 = Leaderboard
  const [activityPage, setActivityPage] = useState(0);
  const [currentTime, setCurrentTime] = useState(moment.utc()); // For countdown updates
  const [allWeeklyActivities, setAllWeeklyActivities] = useState([]);
  const [hasVisitedLeaderboard, setHasVisitedLeaderboard] = useState(false);
  const [showAnimation, setShowAnimation] = useBackgroundAnimation();
  const { pointsData, pointsDataLoading } = useGetPointsData(DateRange.MONTH, activityPage);

  // Track current week identifier to detect week changes (only updates when week actually changes)
  const getWeekIdentifier = (time) => {
    const m = moment.utc(time);
    return `${m.year()}-${m.isoWeek()}`;
  };
  const [currentWeekIdentifier, setCurrentWeekIdentifier] = useState(() => getWeekIdentifier(moment.utc()));
  const weekIdentifierRef = useRef(currentWeekIdentifier);

  // Keep ref in sync with state
  useEffect(() => {
    weekIdentifierRef.current = currentWeekIdentifier;
  }, [currentWeekIdentifier]);

  // Update countdown every minute and check for week changes
  useEffect(() => {
    const interval = setInterval(() => {
      const now = moment.utc();
      setCurrentTime(now);

      // Check if week has changed using ref to avoid stale closure
      const weekId = getWeekIdentifier(now);
      if (weekId !== weekIdentifierRef.current) {
        weekIdentifierRef.current = weekId;
        setCurrentWeekIdentifier(weekId);
      }
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []); // Empty deps - interval doesn't need to be recreated

  useEffect(() => {
    if (activeTab === 1) {
      setHasVisitedLeaderboard(true);
    }
  }, [activeTab]);

  // Fetch all activities for the current week to calculate weekly volume accurately
  // This is separate from paginated data to avoid incorrect calculations when navigating pages
  // Weekly volume counts from Monday 00:00:00 UTC to Sunday 23:59:59 UTC each week
  useEffect(() => {
    const fetchAllWeeklyActivities = async () => {
      try {
        const now = moment.utc();

        // Calculate current week boundaries: Monday 00:00:00 UTC to Sunday 23:59:59 UTC
        const currentWeekStart = now.clone().startOf('isoWeek').startOf('day'); // Monday 00:00:00 UTC
        const currentWeekEnd = now.clone().endOf('isoWeek').endOf('day').seconds(59).milliseconds(999); // Sunday 23:59:59.999 UTC

        // Weekly volume should only count from Season 1 start date onwards
        // Use the later of: Season 1 start date OR current week start
        const startDate = moment.max(SEASON_1_START_DATE, currentWeekStart);
        const endDate = currentWeekEnd;

        // Fetch activities from the relevant week range with a large page size to capture everything needed for calculations
        const result = await getPointsData({
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          activityPage: 1,
          pageSize: 1000, // Large page size to get all weekly activities
        });

        // Filter to only include activities within the current week (Monday 00:00 UTC to Sunday 23:59:59 UTC)
        // AND from Season 1 start date onwards
        const weeklyActivities = (result.points_activity || []).filter((activity) => {
          if (!activity.earned_date) {
            return false;
          }
          const activityDate = moment.utc(activity.earned_date);
          // Must be on or after the start date (season start or current week start, whichever is later)
          // and on or before the end of the current week (Sunday 23:59:59 UTC)
          return activityDate.isSameOrAfter(startDate) && activityDate.isSameOrBefore(endDate);
        });

        setAllWeeklyActivities(weeklyActivities);
      } catch (e) {
        if (e instanceof ApiError) {
          showAlert({
            severity: 'error',
            message: `Failed to fetch weekly volume data: ${e.message}`,
          });
        }
        setAllWeeklyActivities([]);
      }
    };

    fetchAllWeeklyActivities();
    // Only re-fetch when the week identifier changes (not every minute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAlert, currentWeekIdentifier]);

  const {
    total_points = 0,
    total_volume = 0,
    points_activity = [],
    points_activity_count = 0,
    achievements = {},
  } = pointsData;

  // Calculate weekly volume from all weekly activities (not paginated data)
  const weeklyVolume = useMemo(() => {
    if (!allWeeklyActivities || allWeeklyActivities.length === 0) {
      return 0;
    }

    const volumeSum = allWeeklyActivities.reduce((sum, activity) => sum + (activity.volume || 0), 0);

    return volumeSum;
  }, [allWeeklyActivities]);
  const formattedWeeklyVolume = useMemo(() => numberWithCommas(Math.round(Number(weeklyVolume) || 0)), [weeklyVolume]);
  const showWeeklyVolumeAnimation = activeTab === 0 && !hasVisitedLeaderboard;

  const weeklyWeightedVolume = 6160000; // Mock: boosted volume with buffs applied (weeklyVolume × exchange multipliers × volume buffs)
  const referredVolume = 300000; // Mock: volume generated by referred users

  // Calculate countdown until next Sunday (end of week when points are awarded)
  const countdownToNextAward = useMemo(() => {
    const now = currentTime;
    const nextSunday = now.clone().endOf('isoWeek'); // Sunday end of day

    // If we're past Sunday this week, get next week's Sunday
    if (now.isAfter(nextSunday)) {
      nextSunday.add(1, 'week');
    }

    const diff = nextSunday.diff(now);
    const duration = moment.duration(diff);
    const days = Math.floor(duration.asDays());
    const hours = duration.hours();

    if (days > 0) {
      return `${days}d, ${hours}h until next award`;
    }
    return `${hours}h until next award`;
  }, [currentTime]);

  // Calculate current level and progress
  const getCurrentLevel = () => {
    for (let i = VOLUME_LEVELS.length - 1; i >= 0; i -= 1) {
      if (weeklyVolume >= VOLUME_LEVELS[i].threshold) {
        return { level: i + 1, isMax: i === VOLUME_LEVELS.length - 1 };
      }
    }
    return { level: 0, isMax: false };
  };

  const { level: currentLevel, isMax } = getCurrentLevel();

  const volumeBoostCards = useMemo(
    () =>
      VOLUME_BOOST_LEVELS.map((boost) => {
        const isUnlocked = weeklyVolume >= boost.threshold;
        const isActive = isUnlocked && currentLevel === boost.level && currentLevel !== 0;
        const isAchieved = isUnlocked && boost.level < currentLevel;

        return {
          ...boost,
          name: boost.level === 3 ? `Level ${boost.level} 🔥🔥🔥` : `Level ${boost.level}`,
          description: boost.description,
          icon: boost.icon,
          multiplier: boost.multiplier,
          threshold: boost.threshold,
          level: boost.level,
          percentage: boost.percentage,
          isActive,
          isAchieved,
          isLocked: !isUnlocked,
          type: 'volume',
        };
      }),
    [currentLevel, weeklyVolume]
  );

  // Get next threshold for progress bar
  const getProgressData = () => {
    if (isMax) {
      return {
        progress: 100,
        current: weeklyVolume,
        target: VOLUME_LEVELS[VOLUME_LEVELS.length - 1].threshold,
        nextMultiplier: VOLUME_LEVELS[VOLUME_LEVELS.length - 1].label,
      };
    }

    const nextLevelIndex = currentLevel;
    const nextThreshold = VOLUME_LEVELS[nextLevelIndex].threshold;
    const prevThreshold = nextLevelIndex > 0 ? VOLUME_LEVELS[nextLevelIndex - 1].threshold : 0;
    const progress = ((weeklyVolume - prevThreshold) / (nextThreshold - prevThreshold)) * 100;

    return {
      progress: Math.min(progress, 100),
      current: weeklyVolume,
      target: nextThreshold,
      nextMultiplier: VOLUME_LEVELS[nextLevelIndex].label,
    };
  };

  const progressData = getProgressData();

  // Calculate active and inactive volume boosts based on weeklyVolume
  // Only the highest active boost is shown (higher levels replace lower ones)
  // Exchange boosts (static for now)
  const exchangeBoosts = [
    {
      name: 'Bybit Boost',
      multiplier: '2x',
      exchange: 'bybit',
    },
    {
      name: 'Hyperliquid Boost',
      multiplier: '2x',
      exchange: 'hyperliquid',
    },
    {
      name: 'OKXDEX Boost',
      multiplier: '5x',
      exchange: 'okxdex',
    },
  ];

  // Get current active boost percentage for progress bar display
  const currentBoostPercentage = useMemo(() => {
    const activeBoost = volumeBoostCards.find((boost) => boost.isActive);
    return activeBoost ? activeBoost.percentage : 0;
  }, [volumeBoostCards]);

  const renderHistorySection = () => (
    <Stack direction='column' spacing={2}>
      <Typography variant='h6'>Points History</Typography>
      <Paper elevation={0} sx={{ minHeight: '400px' }}>
        <DataComponent
          emptyComponent={<NoPointsActivity />}
          isEmpty={points_activity_count === 0}
          isLoading={pointsDataLoading}
          loadingComponent={<Skeleton sx={{ height: '100%', width: '100%' }} variant='rounded' />}
        >
          <PointsTableSeason1
            achievements={achievements}
            activityPage={activityPage}
            pointsActivity={points_activity}
            pointsActivityCount={points_activity_count}
            onPageChange={setActivityPage}
          />
        </DataComponent>
      </Paper>
    </Stack>
  );

  const getBuffVisualTokens = useCallback(
    (buff) => {
      let baseColor = theme.palette.warning.main;
      let gradientFn = null;

      if (buff.type === 'volume') {
        // Use the same color for all volume boost levels
        baseColor = VOLUME_LEVEL_COLOR_MAP[3] || baseColor; // Use Level 3 color (Gold) for all
        // Apply holographic effect for active volume boost cards
        if (buff.isActive) {
          baseColor = theme.palette.primary.main;
          gradientFn = createHolographicGradient;
        }
      } else if (buff.type === 'exchange') {
        const exchangeConfig = EXCHANGE_COLOR_CONFIG[buff.exchange] || {};
        const isHolographicExchange = exchangeConfig.variant === 'holographic';
        if (isHolographicExchange) {
          baseColor = theme.palette.primary.main;
          gradientFn = createHolographicGradient;
        } else {
          baseColor = theme.palette.text.secondary;
        }
      }

      const isExchange = buff.type === 'exchange';
      const isHolographicExchange =
        isExchange && (EXCHANGE_COLOR_CONFIG[buff.exchange]?.variant === 'holographic' || gradientFn);
      const isActiveVolumeBoost = buff.type === 'volume' && buff.isActive;

      if (isHolographicExchange || isActiveVolumeBoost) {
        const {
          '&::before': baseBefore = {},
          '&::after': baseAfter = {},
          '&:hover': baseHover = {},
          ...holoRoot
        } = isolatedHolographicStyles(theme);
        const { '&::before': hoverBefore = {}, '&::after': hoverAfter = {}, ...hoverRoot } = baseHover;
        const baseRadiusValue = (() => {
          const shapeRadius = theme.shape?.borderRadius ?? 8;
          if (typeof shapeRadius === 'number') {
            return shapeRadius * 1.05;
          }
          const parsed = Number.parseFloat(shapeRadius);
          return Number.isNaN(parsed) ? shapeRadius : `${parsed * 1.5}px`;
        })();
        // Set border radius to 2px for volume boost cards, otherwise use baseRadiusValue
        const borderRadiusValue = isActiveVolumeBoost ? 2 : baseRadiusValue;
        // Remove border for exchange cards, keep border for active volume boost cards using theme primary color
        const holoBorder = isHolographicExchange ? 'none' : `1px solid ${theme.palette.primary.main}`;
        const holoActive = {
          ...holoRoot,
          backgroundColor: isHolographicExchange
            ? theme.palette.background.paper
            : alpha(theme.palette.background.paper, 0.18),
          border: holoBorder,
          borderRadius: borderRadiusValue,
          '&::before': {
            ...baseBefore,
            borderRadius: borderRadiusValue,
          },
          '&::after': {
            ...baseAfter,
            opacity: 0.14,
            borderRadius: borderRadiusValue,
            // Add slow, continuous holographic animation for active volume boost cards
            ...(isActiveVolumeBoost
              ? {
                  animation: 'holographic-move 8s ease-in-out infinite',
                }
              : {}),
          },
          '&:hover': {
            ...hoverRoot,
          },
          '&:hover::before': hoverBefore,
          '&:hover::after': hoverAfter,
        };
        const { '&::after': holoActiveAfter = {}, ...holoActiveRoot } = holoActive;

        return {
          baseColor: theme.palette.primary.main,
          card: {
            active: holoActive,
            achieved: {
              ...holoActiveRoot,
              backgroundColor: isHolographicExchange
                ? theme.palette.background.paper
                : alpha(theme.palette.background.paper, 0.14),
              border: isHolographicExchange ? 'none' : `1px solid ${alpha(theme.palette.common.white, 0.18)}`,
              '&::after': {
                ...holoActiveAfter,
                opacity: 0.1,
              },
            },
            inactive: {
              ...holoActiveRoot,
              backgroundColor: isHolographicExchange
                ? theme.palette.background.paper
                : alpha(theme.palette.background.paper, 0.1),
              border: isHolographicExchange ? 'none' : `1px solid ${alpha(theme.palette.common.white, 0.14)}`,
              '&::after': {
                ...holoActiveAfter,
                opacity: 0.06,
              },
            },
          },
          icon: {
            active: theme.palette.primary.light,
            achieved: alpha(theme.palette.primary.light, 0.8),
            inactive: alpha(theme.palette.primary.light, 0.6),
          },
          multiplier: {
            active: theme.palette.primary.light,
            achieved: alpha(theme.palette.primary.light, 0.85),
            inactive: alpha(theme.palette.primary.light, 0.65),
          },
        };
      }

      const getActiveBackground = () => {
        if (gradientFn) {
          return {
            backgroundColor: 'transparent',
            backgroundImage: gradientFn(0.38, 0.26),
          };
        }
        // Use same background color for both volume and exchange boost cards
        return {
          backgroundColor: theme.palette.background.paper,
        };
      };

      const getAchievedBackground = () => {
        if (gradientFn) {
          return {
            backgroundColor: 'transparent',
            backgroundImage: gradientFn(0.28, 0.2),
          };
        }
        // Use same background color for both volume and exchange boost cards
        return {
          backgroundColor: theme.palette.background.paper,
        };
      };

      const getInactiveBackground = () => {
        if (gradientFn) {
          return {
            backgroundColor: 'transparent',
            backgroundImage: gradientFn(0.2, 0.14),
          };
        }
        // Use same background color for both volume and exchange boost cards
        return {
          backgroundColor: theme.palette.background.paper,
        };
      };

      const activeBackground = getActiveBackground();
      const achievedBackground = getAchievedBackground();
      const inactiveBackground = getInactiveBackground();

      const activeBorderAlpha = isExchange ? 0.28 : 0.46;
      const achievedBorderAlpha = isExchange ? 0.22 : 0.32;
      const inactiveBorderAlpha = isExchange ? 0.16 : 0.2;

      const iconActiveColor = isExchange ? theme.palette.text.primary : baseColor;
      const iconAchievedColor = isExchange ? alpha(theme.palette.text.primary, 0.72) : alpha(baseColor, 0.75);
      const iconInactiveColor = isExchange ? alpha(theme.palette.text.primary, 0.56) : alpha(baseColor, 0.55);

      const multiplierActiveColor = isExchange ? theme.palette.text.primary : baseColor;
      const multiplierAchievedColor = isExchange ? alpha(theme.palette.text.primary, 0.85) : alpha(baseColor, 0.82);
      const multiplierInactiveColor = isExchange ? alpha(theme.palette.text.primary, 0.65) : alpha(baseColor, 0.65);

      // For volume boost cards: active has border using theme primary color, inactive/achieved have no border; for exchange cards, remove border
      const getBorder = (borderAlpha) => {
        if (buff.type === 'volume') {
          if (buff.isActive) {
            return `1px solid ${theme.palette.primary.main}`;
          }
          return 'none';
        }
        // Remove border for exchange boost cards
        return 'none';
      };

      // Set border radius to 2px for all volume boost cards
      const volumeBorderRadius = buff.type === 'volume' ? 2 : 2;

      return {
        baseColor,
        card: {
          active: {
            ...activeBackground,
            border: getBorder(activeBorderAlpha),
            borderRadius: volumeBorderRadius,
          },
          achieved: {
            ...achievedBackground,
            border: getBorder(achievedBorderAlpha),
            borderRadius: volumeBorderRadius,
          },
          inactive: {
            ...inactiveBackground,
            border: getBorder(inactiveBorderAlpha),
            borderRadius: volumeBorderRadius,
          },
        },
        icon: {
          active: iconActiveColor,
          achieved: iconAchievedColor,
          inactive: iconInactiveColor,
        },
        multiplier: {
          active: multiplierActiveColor,
          achieved: multiplierAchievedColor,
          inactive: multiplierInactiveColor,
        },
      };
    },
    [theme]
  );

  const renderPointsTab = () => {
    const volumeBuffs = volumeBoostCards;
    const exchangeBuffCards = exchangeBoosts.map((buff) => ({ ...buff, isActive: true, type: 'exchange' }));

    const renderBuffGrid = (title, buffs, { showUnlockInfo = false, includeProgress = false } = {}) => {
      if (!buffs.length) {
        return null;
      }

      let progressCardStyles;
      if (includeProgress && buffs.length) {
        const activeBuff = buffs.find((buff) => buff.isActive) || null;
        if (activeBuff) {
          const tokens = getBuffVisualTokens(activeBuff);
          progressCardStyles = tokens.card.active;
        }
      }

      return (
        <Stack direction='column' spacing={2}>
          <Typography variant='h6'>{title}</Typography>
          <Grid
            container
            spacing={3}
            sx={{
              alignItems: 'stretch',
              '& > .MuiGrid2-root': {
                display: 'flex',
              },
            }}
          >
            {includeProgress && (
              <Grid md={6} sx={{ display: 'flex' }} xs={12}>
                <PointsWeeklyProgressCard
                  boostPercentage={currentBoostPercentage}
                  cardSx={progressCardStyles}
                  current={progressData.current}
                  progress={progressData.progress}
                  target={progressData.target}
                />
              </Grid>
            )}
            {[...buffs]
              .sort((a, b) => {
                const weight = (item) => {
                  if (item.isActive) {
                    return 0;
                  }
                  if (item.isAchieved) {
                    return 1;
                  }
                  return 2;
                };
                return weight(a) - weight(b);
              })
              .map((buff) => {
                const {
                  exchange,
                  icon: BuffIcon,
                  isActive,
                  isAchieved,
                  isLocked,
                  multiplier,
                  description,
                  name,
                  threshold,
                  type,
                } = buff;
                const ExchangeIcon = exchange ? ExchangeIcons[exchange] : null;
                const visualTokens = getBuffVisualTokens(buff);
                let cardStyles = visualTokens.card.inactive;
                if (isActive) {
                  cardStyles = visualTokens.card.active;
                } else if (isAchieved) {
                  cardStyles = visualTokens.card.achieved;
                }

                let multiplierColor = visualTokens.multiplier.inactive;
                if (isActive) {
                  multiplierColor = visualTokens.multiplier.active;
                } else if (isAchieved) {
                  multiplierColor = visualTokens.multiplier.achieved;
                }

                let descriptionText = description;
                if (!descriptionText) {
                  if (type === 'exchange') {
                    descriptionText = 'Exchange boost';
                  } else if (isActive) {
                    descriptionText = 'Volume boost currently active';
                  } else if (isAchieved) {
                    descriptionText = 'Previously unlocked boost';
                  } else {
                    descriptionText = 'Volume boost available';
                  }
                }

                let cardOpacity = 0.7;
                if (buff.type === 'exchange') {
                  cardOpacity = 1;
                } else if (isActive) {
                  cardOpacity = 1;
                } else if (isAchieved) {
                  cardOpacity = 0.85;
                }

                let keyStatus = 'inactive';
                if (isActive) {
                  keyStatus = 'active';
                } else if (isAchieved) {
                  keyStatus = 'achieved';
                }

                let iconColor = visualTokens.icon.inactive;
                if (isActive) {
                  iconColor = visualTokens.icon.active;
                } else if (isAchieved) {
                  iconColor = visualTokens.icon.achieved;
                }

                const minHeight = Math.min(BOOST_CARD_MIN_HEIGHT[type] || BOOST_CARD_MIN_HEIGHT.volume, 70);
                const maxHeight = 70;
                return (
                  <Grid key={`${name}-${multiplier}-${keyStatus}`} md={6} sx={{ display: 'flex' }} xs={12}>
                    <PointsBuffCard
                      BuffIcon={BuffIcon}
                      cardOpacity={cardOpacity}
                      cardSx={cardStyles}
                      description={descriptionText}
                      exchangeAlt={exchange}
                      exchangeIconSrc={ExchangeIcon}
                      iconColor={iconColor}
                      maxHeight={maxHeight}
                      minHeight={minHeight}
                      multiplier={multiplier}
                      multiplierColor={multiplierColor}
                      title={name}
                    />
                  </Grid>
                );
              })}
          </Grid>
        </Stack>
      );
    };

    return (
      <Stack direction='column' spacing={4}>
        {/* Points and Volume Section */}
        <Box>
          <Box
            aria-label='Account KPIs'
            role='region'
            sx={{
              backgroundColor: theme.palette.background.paper,
              border: 'none',
              borderRadius: 2,
              p: { xs: 2, md: 3 },
            }}
          >
            <Grid
              container
              spacing={3}
              sx={{
                alignItems: 'flex-start',
                '& > .MuiGrid2-root': {
                  display: 'flex',
                },
              }}
            >
              <Grid md={3} xs={12}>
                <Box
                  sx={{
                    width: '100%',
                    p: { xs: 1, md: 1.5 },
                  }}
                >
                  <PointsStatCard plain label='Total Points' value={numberWithCommas(smartRound(total_points, 2))} />
                </Box>
              </Grid>
              <Grid md={3} xs={12}>
                <Box
                  sx={{
                    width: '100%',
                    p: { xs: 1, md: 1.5 },
                  }}
                >
                  <PointsStatCard plain label='All-Time Volume' value={`$${msAndKs(total_volume, 2)}`} />
                </Box>
              </Grid>
              <Grid md={3} xs={12}>
                <Box
                  sx={{
                    width: '100%',
                    p: { xs: 1, md: 1.5 },
                  }}
                >
                  <PointsStatCard plain label='Boost Level 🔥' value={currentLevel ? `Level ${currentLevel}` : '-'} />
                </Box>
              </Grid>
              <Grid md={3} xs={12}>
                <Box
                  sx={{
                    width: '100%',
                    p: { xs: 1, md: 1.5 },
                  }}
                >
                  <PointsStatCard plain label='Referred Volume' value='Coming Soon' />
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Box>

        {/* Weekly Volume Boost (size=9) + Exchange Boosts (size=3) */}
        <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
          {/* Left: Weekly Volume Boost */}
          <Grid md={9} sx={{ display: 'flex' }} xs={12}>
            <Stack direction='column' spacing={2} sx={{ width: '100%' }}>
              <Typography sx={{ color: theme.palette.text.secondary }} variant='body1'>
                Weekly Volume Boost
              </Typography>
              <Typography component='div' sx={{ display: 'flex', alignItems: 'baseline' }} variant='h4'>
                $
                {showWeeklyVolumeAnimation ? (
                  <CountUp className='' decimals={0} duration={0.2} from={0} separator=',' to={weeklyVolume} />
                ) : (
                  <Box component='span'>{formattedWeeklyVolume}</Box>
                )}
              </Typography>
              <WeeklyVolumeProgress
                disableWrapper
                showTargetLabel
                boostPercentage={currentBoostPercentage}
                current={progressData.current}
                progress={progressData.progress}
                showEndpoints={false}
                showNextBoost={!isMax}
                target={progressData.target}
              />
              {/* Level cards */}
              <Grid
                container
                spacing={3}
                sx={{
                  alignItems: 'stretch',
                  '& > .MuiGrid2-root': { display: 'flex' },
                }}
              >
                {volumeBoostCards.map((buff) => {
                  const { icon: BuffIcon, isActive, isAchieved, multiplier, description, name, type } = buff;
                  const visualTokens = getBuffVisualTokens(buff);
                  let cardStyles = visualTokens.card.inactive;
                  if (isActive) {
                    cardStyles = visualTokens.card.active;
                  } else if (isAchieved) {
                    cardStyles = visualTokens.card.achieved;
                  }
                  let keyStatus = 'inactive';
                  if (isActive) keyStatus = 'active';
                  else if (isAchieved) keyStatus = 'achieved';
                  let iconColor = visualTokens.icon.inactive;
                  if (isActive) {
                    iconColor = visualTokens.icon.active;
                  } else if (isAchieved) {
                    iconColor = visualTokens.icon.achieved;
                  }
                  let multiplierColor = visualTokens.multiplier.inactive;
                  if (isActive) {
                    multiplierColor = visualTokens.multiplier.active;
                  } else if (isAchieved) {
                    multiplierColor = visualTokens.multiplier.achieved;
                  }
                  let cardOpacity = 0.7;
                  if (isActive) {
                    cardOpacity = 1;
                  } else if (isAchieved) {
                    cardOpacity = 0.85;
                  }
                  // Use Level 3 card height as baseline for all cards
                  const cardMinHeight = BOOST_CARD_MIN_HEIGHT.volume;
                  return (
                    <Grid key={`${name}-${multiplier}-${keyStatus}`} md={4} sx={{ display: 'flex' }} xs={12}>
                      <PointsBuffCard
                        BuffIcon={BuffIcon}
                        cardOpacity={cardOpacity}
                        cardSx={cardStyles}
                        description={description}
                        iconColor={iconColor}
                        minHeight={cardMinHeight}
                        multiplier={multiplier}
                        multiplierColor={multiplierColor}
                        title={name}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </Stack>
          </Grid>

          {/* Right: Exchange Boosts */}
          <Grid md={3} sx={{ display: 'flex' }} xs={12}>
            <Stack direction='column' spacing={2} sx={{ width: '100%', flex: 1 }}>
              <Typography sx={{ color: theme.palette.text.secondary }} variant='body1'>
                Exchange Boosts
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  backgroundColor: theme.palette.background.paper,
                  border: 'none',
                  p: 2,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Stack direction='column' spacing={2}>
                  {exchangeBoosts.map((buff) => {
                    const { exchange, name, multiplier } = buff;
                    const ExchangeIcon = ExchangeIcons[exchange];
                    const visualTokens = getBuffVisualTokens({ ...buff, type: 'exchange' });
                    // Remove all background-related styles and pseudo-elements from cardStyles for exchange boost cards
                    const {
                      backgroundColor,
                      backgroundImage,
                      background,
                      '&::before': beforeStyles,
                      '&::after': afterStyles,
                      '&:hover': hoverStyles,
                      '&:hover::before': hoverBeforeStyles,
                      '&:hover::after': hoverAfterStyles,
                      ...cardStylesWithoutBg
                    } = visualTokens.card.active;
                    return (
                      <Box key={`${exchange}-${multiplier}`} sx={{ p: 1.5 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            textAlign: 'left',
                            gap: 1,
                          }}
                        >
                          <Stack
                            alignItems='center'
                            direction='row'
                            justifyContent='space-between'
                            spacing={2}
                            sx={{ width: '100%' }}
                          >
                            <Stack alignItems='center' direction='row' spacing={2}>
                              {ExchangeIcon && (
                                <Box
                                  alt={exchange}
                                  component='img'
                                  src={ExchangeIcon}
                                  sx={{
                                    flexShrink: 0,
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                  }}
                                />
                              )}
                              <Typography variant='subtitle1'>{name}</Typography>
                            </Stack>
                            {multiplier && (
                              <Typography
                                sx={{
                                  color: visualTokens.multiplier.active,
                                  flexShrink: 0,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}
                                variant='body1'
                              >
                                {multiplier}
                              </Typography>
                            )}
                          </Stack>
                          <Typography sx={{ color: theme.palette.text.secondary }} variant='body2'>
                            Exchange boost
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
        {renderHistorySection()}
      </Stack>
    );
  };

  const renderLeaderboardTab = () => (
    <Box sx={{ py: 8, textAlign: 'center' }}>
      <Typography sx={{ color: theme.palette.text.secondary, mb: 2 }} variant='h6'>
        Leaderboard
      </Typography>
      <Typography sx={{ color: theme.palette.text.secondary }} variant='body2'>
        Leaderboard functionality coming soon. Check back later to see how you rank against other traders!
      </Typography>
    </Box>
  );

  const renderFaultyTerminalBackground = useCallback(
    () => (
      <FaultyTerminal
        pageLoadAnimation
        brightness={0.18}
        chromaticAberration={0}
        className='points-faulty-terminal'
        curvature={0}
        digitSize={1.2}
        dither={0}
        flickerAmount={1}
        glitchAmount={1}
        gridMul={[2, 1]}
        mouseReact={false}
        mouseStrength={0.5}
        noiseAmp={1}
        pause={false}
        resolutionScale={0.75}
        scale={1.4}
        scanlineIntensity={0.65}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          backgroundColor: alpha(theme.palette.common.black, 0.92),
          backdropFilter: 'blur(6px)',
        }}
        targetFPS={30}
        timeScale={0.18}
        tint='#ff8a00'
      />
    ),
    [theme]
  );

  return (
    <>
      <GlobalStyles
        styles={{
          '@keyframes holographic-move': {
            '0%': {
              backgroundPosition: '0% 50%',
            },
            '50%': {
              backgroundPosition: '100% 50%',
            },
            '100%': {
              backgroundPosition: '0% 50%',
            },
          },
        }}
      />
      <BackgroundAnimationWrapper
        isFeatureEnabled
        renderBackground={renderFaultyTerminalBackground}
        showAnimation={showAnimation}
      />
      <Container
        maxWidth='lg'
        sx={{
          my: 4,
          px: 2,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            backgroundColor: 'background.container',
            borderRadius: 4,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <PointsLoadingMask open={pointsDataLoading} />
          <Stack direction='column' spacing={3} sx={{ p: { xs: 3, md: 4 } }}>
            {/* Tab Navigation */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: 1,
                borderColor: 'divider',
                pb: 0,
              }}
            >
              <Tabs
                aria-label='Points Season 1 tabs'
                sx={{
                  minHeight: 'auto',
                  '& .MuiTab-root': {
                    color: theme.palette.text.secondary,
                    minHeight: 'auto',
                    padding: '12px 16px',
                  },
                  '& .Mui-selected': {
                    color: theme.palette.primary.main,
                  },
                  '& .MuiTabs-indicator': {
                    backgroundColor: theme.palette.primary.main,
                  },
                }}
                value={activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
              >
                <Tab label='Points' />
                <Tab label='Leaderboard' />
              </Tabs>
              <Stack alignItems='center' direction='row' spacing={2}>
                <Button
                  color='primary'
                  href='https://docs.tread.fi/points-program'
                  rel='noopener noreferrer'
                  startIcon={<ArticleIcon />}
                  target='_blank'
                  variant='text'
                >
                  Learn more
                </Button>
              </Stack>
            </Box>

            {/* Tab Content */}
            {activeTab === 0 && renderPointsTab()}
            {activeTab === 1 && renderLeaderboardTab()}
          </Stack>
        </Paper>
      </Container>
      {/* Desktop: fixed positioning at bottom-right corner */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 2000,
          pointerEvents: 'auto',
        }}
      >
        <BackgroundToggle showAnimation={showAnimation} onToggle={setShowAnimation} />
      </Box>
    </>
  );
}

export default PointsPageSeason1;
