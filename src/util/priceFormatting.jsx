import React from 'react';

const sub = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

/**
 * Renders a price with subscript notation for zero count after decimal
 * Only applies when price is less than 1 and has leading zeros
 * Returns JSX elements for React components
 * @param {number|string} price - The price to format
 * @returns {JSX.Element} - The formatted price with subscript JSX
 */
export function renderPriceWithSubscript(price) {
  const priceNum = Number(price);
  const priceStr = String(price);

  // Only apply subscript formatting if price is less than 1
  if (priceNum >= 1) {
    return priceStr;
  }

  // Match: 0.(zeros)(rest), at least 2 zeros after decimal, then a nonzero digit
  const match = priceStr.match(/^(\d*)\.(0{2,})([1-9]\d*)$/);
  if (match) {
    const [, intPart, zeros, rest] = match;
    return (
      <>
        {intPart}.0<sub style={{ fontSize: '0.7em', verticalAlign: 'sub', opacity: 0.7 }}>{zeros.length}</sub>
        {rest}
      </>
    );
  }
  return priceStr;
}

export function renderPriceWithSubscriptString(price) {
  const priceNum = Number(price).toFixed(10);
  const priceStr = String(priceNum);

  // Only apply subscript formatting if price is less than 1
  if (priceNum >= 1) {
    return priceStr;
  }

  // Match: 0.(zeros)(rest), at least 2 zeros after decimal, then a nonzero digit
  const match = priceStr.match(/^(\d*)\.(0{2,})([1-9]\d*)$/);
  if (match) {
    const [, intPart, zeros, rest] = match;
    return `${intPart}.0${sub[zeros.length]}${rest}`;
  }
  return priceStr;
}

/**
 * Renders a balance with subscript notation for very small numbers
 * Converts scientific notation to subscript format like 0.0_5 2323
 * @param {number|string} balance - The balance to format
 * @returns {JSX.Element} - The formatted balance with subscript JSX
 */
export function renderBalanceWithSubscript(balance) {
  const balanceNum = Number(balance);

  // If it's a normal number (not scientific notation), use regular formatting
  if (balanceNum >= 1 || balanceNum === 0) {
    return balanceNum.toFixed(6).replace(/\.?0+$/, '');
  }

  // Handle very small numbers (scientific notation)
  if (balanceNum < 1e-6) {
    // Convert to string with enough precision to avoid scientific notation
    const balanceStr = balanceNum.toFixed(20);

    // Find the first non-zero digit after decimal
    const match = balanceStr.match(/^0\.(0*)([1-9]\d*)$/);
    if (match) {
      const [, zeros, rest] = match;
      const zeroCount = zeros.length;

      // Take first 4-6 digits after the zeros for display
      const displayDigits = rest.substring(0, Math.min(6, rest.length));

      return (
        <>
          0.0<sub style={{ fontSize: '0.7em', verticalAlign: 'sub', opacity: 0.7 }}>{zeroCount}</sub>
          {displayDigits}
        </>
      );
    }
  }

  // For numbers between 1e-6 and 1, use regular formatting with up to 6 decimal places
  return balanceNum.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Formats price for chart y-axis with optimal decimal precision
 * Shows exactly 3 significant digits for small numbers
 * Reduces unnecessary decimal places for large numbers
 * @param {number|string} price - The price to format
 * @returns {string} - The formatted price string
 *
 * Examples:
 * formatChartPrice(0.000123) -> "0.000123" (3 sig digits: 1,2,3)
 * formatChartPrice(0.0000123) -> "0.0000123" (3 sig digits: 1,2,3)
 * formatChartPrice(0.00123) -> "0.00123" (3 sig digits: 1,2,3)
 * formatChartPrice(1.234) -> "1.23" (2 decimal places for medium)
 * formatChartPrice(123.456) -> "123.46" (2 decimal places for medium)
 * formatChartPrice(1234.567) -> "1234.6" (1 decimal place for large)
 * formatChartPrice(12345.678) -> "12346" (no decimal places for very large)
 */
export function formatChartPrice(price) {
  const priceNum = Number(price);

  if (!Number.isFinite(priceNum)) {
    return String(price);
  }

  // For very small numbers (< 0.001), ensure we show exactly 3 significant digits
  if (priceNum < 0.001 && priceNum > 0) {
    // Calculate how many decimal places we need for 3 significant digits
    const magnitude = Math.floor(Math.log10(priceNum));
    const decimalPlaces = Math.abs(magnitude) + 2; // +2 because magnitude is negative and we want 3 sig digits
    return priceNum.toFixed(decimalPlaces);
  }

  // For small numbers (0.001 to 0.999), show exactly 3 significant digits
  if (priceNum < 1 && priceNum >= 0.001) {
    // Calculate how many decimal places we need for 3 significant digits
    const magnitude = Math.floor(Math.log10(priceNum));
    const decimalPlaces = Math.abs(magnitude) + 2; // +2 because magnitude is negative and we want 3 sig digits
    return priceNum.toFixed(decimalPlaces);
  }

  // For medium numbers (1 to 999), show up to 2 decimal places
  if (priceNum < 1000) {
    return priceNum.toFixed(2).replace(/\.?0+$/, '');
  }

  // For large numbers (1000+), show up to 1 decimal place
  if (priceNum < 10000) {
    return priceNum.toFixed(1).replace(/\.?0+$/, '');
  }

  // For very large numbers (10000+), show no decimal places
  return Math.round(priceNum).toString();
}
