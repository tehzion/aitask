import React from 'react';
import type { Department } from '../types';
import { STAFF_DEPARTMENTS, normalizeDepartments } from '../lib/departments';
import { cn } from '../lib/utils';

interface DepartmentMultiSelectProps {
  value: Department[];
  onChange: (departments: Department[]) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

const DepartmentMultiSelect: React.FC<DepartmentMultiSelectProps> = ({
  value,
  onChange,
  disabled = false,
  label = 'Departments',
  description = 'Select every department this member can receive assignments from.',
}) => {
  const descriptionId = React.useId();
  const selected = new Set(normalizeDepartments(value));

  const toggleDepartment = (department: Department) => {
    const next = new Set(selected);
    if (next.has(department)) next.delete(department);
    else next.add(department);
    onChange(normalizeDepartments([...next]));
  };

  return (
    <fieldset disabled={disabled} aria-describedby={descriptionId}>
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      <p id={descriptionId} className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STAFF_DEPARTMENTS.map(department => (
          <label
            key={department}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
              selected.has(department)
                ? 'border-blue-300 bg-blue-50 text-blue-900'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={selected.has(department)}
              onChange={() => toggleDepartment(department)}
            />
            <span className="font-medium">{department}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};

export default DepartmentMultiSelect;
