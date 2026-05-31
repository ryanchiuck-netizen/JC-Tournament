import React from "react";
import { Search, Download } from "lucide-react";
import { AgeFilter } from "../types";

interface FilterBarProps {
  ageFilter: AgeFilter;
  setAgeFilter: (filter: AgeFilter) => void;
  within120km: boolean;
  setWithin120km: (within: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  handleExport: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  ageFilter,
  setAgeFilter,
  within120km,
  setWithin120km,
  searchTerm,
  setSearchTerm,
  handleExport
}) => {
  return (
    <div className="flex flex-col gap-6 mb-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Age Filter Tabs */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <div className="flex bg-gray-900/50 p-1 rounded-xl border border-gray-800 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setAgeFilter("ALL")}
              className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${ageFilter === "ALL" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
            >
              All
            </button>
            <button 
              onClick={() => setAgeFilter("U10")}
              className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${ageFilter === "U10" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
            >
              U10
            </button>
            <button 
              onClick={() => setAgeFilter("U12")}
              className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${ageFilter === "U12" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
            >
              U12
            </button>
          </div>
          
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
            <input 
              type="checkbox" 
              checked={within120km}
              onChange={(e) => setWithin120km(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
            />
            Within 120km
          </label>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto shrink-0"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter locally..."
              className="w-full bg-gray-900 border border-gray-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 transition-all outline-none shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
