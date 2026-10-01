import React, { useState, useEffect } from 'react';
import { getLiveWeatherAnalysis } from '../utils/weatherService';

export default function WeatherHeaderBadge() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    let isMounted = true;
    getLiveWeatherAnalysis().then((d) => {
      if (isMounted) setWeather(d);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!weather) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        backgroundColor: 'rgba(5, 178, 165, 0.08)',
        border: '1px solid rgba(5, 178, 165, 0.25)',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '0.8rem',
        color: 'var(--text-primary)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
      title={`新北市三重區：即時溫度 ${weather.currentTemp}°C，體感 ${weather.apparentTemp}°C ｜ ${weather.conditionLabel}`}
    >
      <span>{weather.conditionIcon}</span>
      <span>三重 {weather.currentTemp}°C</span>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
        ({weather.conditionLabel})
      </span>
    </div>
  );
}
