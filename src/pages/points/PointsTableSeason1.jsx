import React from 'react';
import { Table, TableBody, TableContainer, TableHead, TableRow, TablePagination, Box, Link, useTheme } from '@mui/material';
import { StyledHeaderTableCellWithLine, StyledTableCell, formatDateTime } from '@/shared/orderTable/util';
import { insertEllipsis, numberWithCommas, smartRound } from '@/util';

const COLUMNS = [
  { id: 'earned_date', label: 'Date', width: 200, align: 'left' },
  { id: 'source', label: 'Source', width: 150, align: 'left' },
  { id: 'volume', label: 'Volume', width: 150, align: 'right' },
];

function PointsTableCell({ row, column, achievements }) {
  const value = row[column.id];
  switch (column.id) {
    case 'earned_date':
      return formatDateTime(value);
    case 'volume':
      return value ? `$${numberWithCommas(smartRound(value, 2))}` : '-';
    case 'source':
      if (row.source_type === 'order') {
        return <Link href={`/order/${row.source_data}`}>{insertEllipsis(row.source_data, 8, 6)}</Link>;
      }
      if (row.source_type === 'referral') {
        return 'Referral Bonus';
      }
      if (row.source_type === 'beta_bonus') {
        return 'Beta Tester Bonus';
      }
      if (row.source_type === 'achievement') {
        const achievement = achievements[row.source_data];
        return `${achievement?.title || row.source_data} achievement`;
      }
      // Default: return the source_type if it doesn't match any known types
      return row.source_type || '-';
    default:
      return value;
  }
}

function PointsTableSeason1({
  pointsActivity,
  pointsActivityCount,
  activityPage,
  onPageChange,
  achievements,
  rowsPerPage = 10,
}) {
  const theme = useTheme();
  const handleChangePage = (event, newPage) => {
    onPageChange(newPage);
  };

  return (
    <Box sx={{ height: '100%' }}>
      <TableContainer style={{ height: 'calc(100% - 60px)' }}>
        <Table
          stickyHeader
          aria-label='sticky table'
          sx={{
            borderCollapse: 'separate',
            borderSpacing: '0 8px',
            '& .MuiTableCell-root': {
              borderBottom: `1px solid ${theme.palette.common.transparent}`,
            },
          }}
        >
          <TableHead>
            <TableRow>
              {COLUMNS.map((column) => (
                <StyledHeaderTableCellWithLine
                  align={column.align}
                  key={`main header${column.id}`}
                  style={{
                    width: column.width,
                  }}
                >
                  {column.label}
                </StyledHeaderTableCellWithLine>
              ))}
            </TableRow>
          </TableHead>
          <TableBody sx={{ overflow: 'auto' }}>
            {pointsActivity.map((row) => (
              <TableRow hover key={`${row.earned_date}-${row.source_data || row.source_type}`} sx={{ '& > td, & > th': { py: 1.5 } }}>
                {COLUMNS.map((column) => (
                  <StyledTableCell
                    align={column.align}
                    key={column.id}
                    style={{
                      width: column.width,
                    }}
                  >
                    <PointsTableCell achievements={achievements} column={column} row={row} />
                  </StyledTableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component='div'
        count={pointsActivityCount}
        page={activityPage}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[]}
        sx={{ height: '60px' }}
        onPageChange={handleChangePage}
      />
    </Box>
  );
}

export default PointsTableSeason1;

