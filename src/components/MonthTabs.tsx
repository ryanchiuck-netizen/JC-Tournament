import React, { useMemo } from "react";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

interface MonthTabsProps {
  selectedMonth: number | 'ALL';
  setSelectedMonth: (month: number | 'ALL') => void;
}

export const MonthTabs: React.FC<MonthTabsProps> = ({ selectedMonth, setSelectedMonth }) => {
  const monthTabs = useMemo(() => {
    const tabs = [];
    for (let i = 0; i < 12; i++) {
      tabs.push({ index: i, name: MONTHS[i] });
    }
    return tabs;
  }, []);

  return (
    <div className="bg-gray-900 border-b border-gray-800 sticky top-16 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex overflow-x-auto no-scrollbar py-2 gap-2">
          <button
            onClick={() => setSelectedMonth('ALL')}
            className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${
              selectedMonth === 'ALL' 
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                : 'bg-gray-800/50 text-gray-400 border border-transparent hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            All Year
          </button>
          {monthTabs.map(tab => (
            <button
              key={tab.index}
              onClick={() => setSelectedMonth(tab.index)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${
                selectedMonth === tab.index 
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                  : 'bg-gray-800/50 text-gray-400 border border-transparent hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
