import { airportTimezoneService } from './airport-timezone';

export interface AvailabilityEntry {
  userId: number;
  username: string;
  date: string; // YYYY-MM-DD format
  departure: string; // 3-letter airport code
  arrival: string; // 3-letter airport code
  originalText: string;
  expiryTimestamp: number; // Unix timestamp when entry expires (midnight local time in departure timezone)
}

export interface ParseResult {
  success: boolean;
  entry?: AvailabilityEntry;
  error?: 'format' | 'date_limit';
}

function isValidDateFormat(dateStr: string): boolean {
  // Parse MMDD format
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  
  // Basic validation for month and day ranges
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function determineYearForDate(month: number, day: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JS months are 0-based
  
  // Create date for this year and last year
  const thisYearDate = new Date(currentYear, month - 1, day);
  const lastYearDate = new Date(currentYear - 1, month - 1, day);
  
  // Create today's date at midnight for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Calculate differences in days
  const thisYearDiff = (thisYearDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  const lastYearDiff = (lastYearDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  
  // Special case for year boundaries (Jan-Feb with Dec dates, Nov-Dec with Jan-Feb dates)
  const isEarlyYear = currentMonth <= 2; // January or February
  const isLateYear = currentMonth >= 11; // November or December
  const isDecember = month === 12;
  const isJanFeb = month <= 2;
  
  // If we're in early year and the target is December, it might be last year
  if (isEarlyYear && isDecember && Math.abs(lastYearDiff) < Math.abs(thisYearDiff)) {
    return currentYear - 1;
  }
  
  // If we're in late year and target is Jan/Feb, it might be next year
  if (isLateYear && isJanFeb && Math.abs(thisYearDiff + 365) < Math.abs(thisYearDiff)) {
    return currentYear + 1;
  }
  
  // For regular cases, use the year that results in a date closest to today within reasonable range
  if (Math.abs(thisYearDiff) <= 15) {
    return currentYear;
  }
  
  // If this year's version is far in the past, try next year
  if (thisYearDiff < -15) {
    return currentYear + 1;
  }
  
  // Default to current year
  return currentYear;
}

function isDateWithinRange(dateStr: string): boolean {
  // Parse MMDD format
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  
  const now = new Date();
  const targetYear = determineYearForDate(month, day);
  const targetDate = new Date(targetYear, month - 1, day);
  
  // Check date is within 2 days ago to 8 days in the future (with timezone tolerance)
  const maxPastDays = 2;
  const maxFutureDays = 8;
  
  const diffMs = targetDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  
  return diffDays >= -maxPastDays && diffDays <= maxFutureDays;
}

export function parseAvailabilityEntry(
  text: string,
  userId: number,
  username: string,
  fullCommand?: string
): ParseResult {
  const normalizedText = text.trim().toLowerCase();
  
  // Simple patterns: 1115 ber ist, 1115 BER / IST, 1115 BER-IST
  const patterns = [
    // Basic pattern: 1115 ber ist
    /^(\d{4})\s+([a-z]{3})\s+([a-z]{3})$/,
    
    // With slash separator: 1115 BER / IST
    /^(\d{4})\s+([a-z]{3})\s*\/\s*([a-z]{3})$/,
    
    // With dash separator: 1115 BER-IST
    /^(\d{4})\s+([a-z]{3})-([a-z]{3})$/,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match) {
      let dateStr: string;
      let departure: string;
      let arrival: string;

      // All patterns use MMDD format
      const matchedDate = match[1];
      const matchedDeparture = match[2];
      const matchedArrival = match[3];
      
      if (!matchedDate || !matchedDeparture || !matchedArrival) {
        continue; // Try next pattern
      }
      
      dateStr = matchedDate;
      departure = matchedDeparture;
      arrival = matchedArrival;

      // Validate airport codes (3 letters) and date format
      if (departure.length === 3 && arrival.length === 3) {
        // First check if date format is valid (month 1-12, day 1-31)
        if (!isValidDateFormat(dateStr)) {
          return {
            success: false,
            error: 'format'
          };
        }
        
        // Then check if date is within allowed range
        if (!isDateWithinRange(dateStr)) {
          return {
            success: false,
            error: 'date_limit'
          };
        }
        
        // Convert MMDD to full YYYY-MM-DD date
        const month = parseInt(dateStr.substring(0, 2), 10);
        const day = parseInt(dateStr.substring(2, 4), 10);
        const year = determineYearForDate(month, day);
        const fullDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // Calculate expiry timestamp for midnight in departure timezone
        const mmdd = `${month.toString().padStart(2, '0')}${day.toString().padStart(2, '0')}`;
        const expiryTimestamp = airportTimezoneService.getMidnightTimestamp(departure.toUpperCase(), mmdd, year);
        
        return {
          success: true,
          entry: {
            userId,
            username,
            date: fullDate,
            departure: departure.toUpperCase(),
            arrival: arrival.toUpperCase(),
            originalText: fullCommand ? fullCommand.trim() : text.trim(),
            expiryTimestamp,
          }
        };
      }
    }
  }

  return {
    success: false,
    error: 'format'
  };
}