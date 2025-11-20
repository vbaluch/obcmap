import * as fs from 'fs';
import * as path from 'path';
const { find } = require('geo-tz/dist/find-now');

interface Airport {
  iataCode: string;
  latitude: number;
  longitude: number;
  name: string;
}

export class AirportTimezoneService {
  private airports: Map<string, Airport> = new Map();

  constructor() {
    this.loadAirports();
  }

  private loadAirports(): void {
    const airportsPath = path.join(__dirname, '../..', 'ourairports-data', 'airports.csv');
    
    if (!fs.existsSync(airportsPath)) {
      console.warn('Airports data file not found, timezone detection will fallback to UTC-12');
      return;
    }

    try {
      const csvContent = fs.readFileSync(airportsPath, 'utf-8');
      const lines = csvContent.split('\n');
      
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        const airport = this.parseAirportLine(trimmedLine);
        if (airport && airport.iataCode) {
          this.airports.set(airport.iataCode, airport);
        }
      }
      
      console.log(`Loaded ${this.airports.size} airports with IATA codes`);
    } catch (error) {
      console.warn('Failed to load airports data:', error);
    }
  }

  private parseAirportLine(line: string): Airport | null {
    try {
      // Parse CSV - handle quoted fields properly
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      let i = 0;
      
      while (i < line.length) {
        const char = line[i];
        
        if (char === '"') {
          if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
            // Escaped quote
            current += '"';
            i += 2;
          } else {
            // Toggle quotes
            inQuotes = !inQuotes;
            i++;
          }
        } else if (char === ',' && !inQuotes) {
          fields.push(current);
          current = '';
          i++;
        } else {
          current += char;
          i++;
        }
      }
      fields.push(current); // Add last field
      
      if (fields.length < 14) return null;
      
      const latitudeStr = fields[4];
      const longitudeStr = fields[5];
      const iataCode = fields[13]; // IATA code is at index 13
      const name = fields[3];
      
      if (!latitudeStr || !longitudeStr || !iataCode || !name) {
        return null;
      }
      
      const latitude = parseFloat(latitudeStr);
      const longitude = parseFloat(longitudeStr);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return null;
      }
      
      return {
        iataCode: iataCode.trim(),
        latitude,
        longitude,
        name: name.trim()
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get timezone identifier from airport IATA code
   * Returns the IANA timezone identifier (e.g., 'Europe/Berlin')
   */
  public getTimezone(airportCode: string): string {
    const airport = this.airports.get(airportCode.toUpperCase());
    
    if (!airport) {
      // Fallback to UTC-12
      return 'Etc/UTC-12';
    }

    try {
      const timezones = find(airport.latitude, airport.longitude);
      if (timezones && timezones.length > 0) {
        return timezones[0];
      }
    } catch (error) {
      console.warn(`Failed to get timezone for ${airportCode}:`, error);
    }
    
    // Fallback to UTC-12
    return 'Etc/UTC-12';
  }


  /**
   * Get the midnight timestamp for a given airport on a given date
   * @param airportCode IATA airport code  
   * @param dateStr MMDD format date string
   * @param year Year (defaults to current year, or next year if date has passed)
   * @returns Timestamp of midnight at that airport location
   */
  public getMidnightTimestamp(airportCode: string, dateStr: string, year?: number): number {
    const timezone = this.getTimezone(airportCode);
    
    // Parse MMDD
    const month = parseInt(dateStr.substring(0, 2), 10); // Natural month number (1-12)
    const day = parseInt(dateStr.substring(2, 4), 10);
    
    // Determine year if not provided
    if (!year) {
      const now = new Date();
      year = now.getFullYear();
    }
    
    // Handle UTC-12 fallback directly
    if (timezone === 'Etc/UTC-12') {
      // For UTC-12: entry expires at midnight AFTER the departure day
      // So for date 11/15, it expires at start of 11/16 in UTC-12 timezone
      // UTC-12 midnight for Nov 16 = 12:00 UTC Nov 16
      return new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0, 0)).getTime();
    }
    
    // Create a date at midnight of the next day (expiry time) in UTC
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
    
    // Use the target date to calculate the timezone offset (important for DST)
    const testTime = new Date(nextDay); // Use the actual target date to get correct DST offset
    const utcTime = testTime.toLocaleString('sv-SE', { timeZone: 'UTC' });
    const localTime = testTime.toLocaleString('sv-SE', { timeZone: timezone });
    
    // Calculate the offset in hours
    const utcDate = new Date(utcTime);
    const localDate = new Date(localTime);
    const offsetHours = (localDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
    
    // For midnight in the target timezone, subtract the offset from UTC midnight
    // If timezone is UTC+1, local midnight happens 1 hour before UTC midnight
    const localMidnightUTC = nextDay.getTime() - (offsetHours * 60 * 60 * 1000);
    
    return localMidnightUTC;
  }

  /**
   * Check if an entry with given departure airport and full date has expired
   * @param departureAirport IATA airport code
   * @param fullDate YYYY-MM-DD format date string
   */
  public hasEntryExpired(departureAirport: string, fullDate: string): boolean {
    // Parse YYYY-MM-DD format
    const parts = fullDate.split('-');
    if (parts.length !== 3) {
      throw new Error(`Invalid date format: ${fullDate}. Expected YYYY-MM-DD.`);
    }
    
    const [yearStr, monthStr, dayStr] = parts;
    if (!yearStr || !monthStr || !dayStr) {
      throw new Error(`Invalid date format: ${fullDate}. Expected YYYY-MM-DD.`);
    }
    
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const entryMidnight = this.getMidnightTimestamp(departureAirport, `${month.toString().padStart(2, '0')}${day.toString().padStart(2, '0')}`, year);
    
    return Date.now() >= entryMidnight;
  }

  /**
   * Get airport info for debugging/logging
   */
  public getAirportInfo(airportCode: string): { found: boolean; name?: string; timezone?: string } {
    const airport = this.airports.get(airportCode.toUpperCase());
    if (!airport) {
      return { found: false };
    }
    
    return {
      found: true,
      name: airport.name,
      timezone: this.getTimezone(airportCode)
    };
  }

  /**
   * Get the total number of airports loaded
   */
  public getAirportCount(): number {
    return this.airports.size;
  }
}

// Singleton instance
export const airportTimezoneService = new AirportTimezoneService();