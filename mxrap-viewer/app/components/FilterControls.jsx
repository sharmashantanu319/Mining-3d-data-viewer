import { IconX } from "./icons";
import {
  FILTER_SLIDER_STEPS,
  createCategoryFilter,
  createRangeFilter,
  fromDateTimeInputValue,
  niceRangeBounds,
  roundDateBound,
  roundSliderBound,
  sliderPositionForValue,
  toDateTimeInputValue,
  valueForSliderPosition,
} from "./dataFilters";

// The same filter with one setting changed, rebuilt so it stays validated.
function withChanges(filter, changes) {
  const next = { ...filter, ...changes };
  return next.kind === "category"
    ? createCategoryFilter({ ...next, allowedValues: [...next.allowedValues] })
    : createRangeFilter(next);
}

/**
 * Two thumbs on one track. Positions are shares of the points (0 to
 * FILTER_SLIDER_STEPS), so moving a thumb a tenth of the way hides about a
 * tenth of the points whatever the spread of the values.
 */
function RangeSlider({ label, low, high, onLowChange, onHighChange }) {
  const steps = FILTER_SLIDER_STEPS;
  const lowShare = low / steps;
  const highShare = high / steps;
  return (
    <div className="range-slider">
      <div className="range-slider-track" />
      <div
        className="range-slider-fill"
        style={{
          left: `calc(${lowShare} * (100% - 12px) + 6px)`,
          width: `calc(${Math.max(highShare - lowShare, 0)} * (100% - 12px))`,
        }}
      />
      <input
        type="range"
        min="0"
        max={steps}
        step="1"
        value={low}
        aria-label={`${label}: lowest value to show`}
        onChange={(event) => onLowChange(Math.min(Number(event.target.value), high))}
        // When both thumbs sit at the right-hand end, the lower one must be
        // on top or it could never be dragged back.
        style={{ zIndex: low > steps * 0.98 ? 3 : 2 }}
      />
      <input
        type="range"
        min="0"
        max={steps}
        step="1"
        value={high}
        aria-label={`${label}: highest value to show`}
        onChange={(event) => onHighChange(Math.max(Number(event.target.value), low))}
        style={{ zIndex: 2 }}
      />
    </div>
  );
}

function NumberRange({ field, filter, onChange }) {
  const sorted = field.sortedValues;
  const outer = niceRangeBounds(field.min, field.max);
  const low = sliderPositionForValue(sorted, filter.min, "min");
  const high = sliderPositionForValue(sorted, filter.max, "max");
  // A thumb at either end means "no limit on that side", shown as the
  // data's rounded range rather than the exact extreme value.
  const minAt = (position) =>
    position <= 0 ? outer.min : roundSliderBound(valueForSliderPosition(sorted, position), "down");
  const maxAt = (position) =>
    position >= FILTER_SLIDER_STEPS ? outer.max : roundSliderBound(valueForSliderPosition(sorted, position), "up");
  const typed = (event) => (event.target.value === "" ? undefined : Number(event.target.value));

  return (
    <>
      <div className="filter-range-inputs">
        <input
          type="number"
          className="ctrl-input filter-number"
          aria-label={`${field.label} minimum`}
          title="Lowest value to show"
          step="any"
          value={filter.min ?? ""}
          onChange={(event) => onChange(withChanges(filter, { min: typed(event) }))}
        />
        <span className="filter-range-to">to</span>
        <input
          type="number"
          className="ctrl-input filter-number"
          aria-label={`${field.label} maximum`}
          title="Highest value to show"
          step="any"
          value={filter.max ?? ""}
          onChange={(event) => onChange(withChanges(filter, { max: typed(event) }))}
        />
      </div>
      {sorted?.length > 1 && (
        <RangeSlider
          label={field.label}
          low={low}
          high={high}
          onLowChange={(position) => onChange(withChanges(filter, { min: minAt(position) }))}
          onHighChange={(position) => onChange(withChanges(filter, { max: maxAt(position) }))}
        />
      )}
    </>
  );
}

// A time window: From / To boxes to the minute, and the same two-thumb
// slider as a number range, so the window can be dragged through the data
// (the client's "time filtering within one slide", email of 22 September).
function DateRange({ field, filter, onChange }) {
  const sorted = field.sortedValues;
  const low = sliderPositionForValue(sorted, filter.min, "min");
  const high = sliderPositionForValue(sorted, filter.max, "max");
  const minAt = (position) =>
    roundDateBound(position <= 0 ? field.min : valueForSliderPosition(sorted, position), "down");
  const maxAt = (position) =>
    roundDateBound(position >= FILTER_SLIDER_STEPS ? field.max : valueForSliderPosition(sorted, position), "up");
  const typed = (event, edge) => fromDateTimeInputValue(event.target.value, edge) ?? undefined;

  return (
    <>
      <div className="filter-date-inputs">
        <span className="filter-range-to">From</span>
        <input
          type="datetime-local"
          className="ctrl-input"
          aria-label={`${field.label} from`}
          title="Earliest time to show (as in the export)"
          step="60"
          value={toDateTimeInputValue(filter.min)}
          onChange={(event) => onChange(withChanges(filter, { min: typed(event, "min") }))}
        />
        <span className="filter-range-to">To</span>
        <input
          type="datetime-local"
          className="ctrl-input"
          aria-label={`${field.label} to`}
          title="Latest time to show (as in the export)"
          step="60"
          value={toDateTimeInputValue(filter.max)}
          onChange={(event) => onChange(withChanges(filter, { max: typed(event, "max") }))}
        />
      </div>
      {sorted?.length > 1 && (
        <RangeSlider
          label={field.label}
          low={low}
          high={high}
          onLowChange={(position) => onChange(withChanges(filter, { min: minAt(position) }))}
          onHighChange={(position) => onChange(withChanges(filter, { max: maxAt(position) }))}
        />
      )}
    </>
  );
}

function CategoryChoices({ field, filter, onChange }) {
  return (
    <div className="filter-categories">
      {field.values.map((value) => (
        <label key={value}>
          <input
            type="checkbox"
            className="ctrl-check"
            checked={filter.allowedValues.has(value)}
            onChange={(event) => {
              const next = new Set(filter.allowedValues);
              if (event.target.checked) next.add(value);
              else next.delete(value);
              if (next.size === 0) return;
              onChange(withChanges(filter, { allowedValues: next }));
            }}
          />
          {value}
        </label>
      ))}
    </div>
  );
}

/**
 * One active filter in the Filters section: its controls, how many points it
 * hides on its own, and, for a column with blanks, whether to keep the
 * points that have no value.
 */
export function ActiveFilter({ field, filter, hiddenCount, totalCount, onChange, onRemove }) {
  const isNumberRange = filter.kind === "range" && field.inputType === "number";
  const isDateRange = filter.kind === "range" && field.inputType === "date";
  return (
    <div className="filter-card">
      <div className="filter-card-head">
        <span className="filter-card-name" title={field.label}>{field.label}</span>
        <button type="button" className="filter-card-remove" onClick={onRemove} title={`Remove the ${field.label} filter`} aria-label={`Remove the ${field.label} filter`}>
          <IconX size={10} />
        </button>
      </div>
      {isNumberRange && <NumberRange field={field} filter={filter} onChange={onChange} />}
      {isDateRange && <DateRange field={field} filter={filter} onChange={onChange} />}
      {filter.kind === "category" && <CategoryChoices field={field} filter={filter} onChange={onChange} />}
      <div className={`filter-card-effect${hiddenCount > 0 ? " is-hiding" : ""}`}>
        {hiddenCount > 0
          ? `Hides ${hiddenCount.toLocaleString()} of ${totalCount.toLocaleString()} points`
          : "Not hiding any points yet"}
      </div>
      {field.missingCount > 0 && (
        <label className="filter-card-check">
          <input
            type="checkbox"
            className="ctrl-check"
            checked={filter.includeMissing === true}
            onChange={(event) => onChange(withChanges(filter, { includeMissing: event.target.checked }))}
          />
          Keep the {field.missingCount.toLocaleString()} {field.missingCount === 1 ? "point" : "points"} with no {field.label}
        </label>
      )}
    </div>
  );
}
