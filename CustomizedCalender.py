from datetime import datetime, timedelta
from enum import IntEnum

WEEKDAY = IntEnum('WEEKDAY', 'MON TUE WED THU FRI SAT SUN', start=1)

class CustomizedCalendar:

    def __init__(self, start_weekday, indicator_weekday=None):
        self.start_weekday = start_weekday
        self.indicator_delta = 3 if not (indicator_weekday) else (indicator_weekday - start_weekday) % 7

    def get_week_start(self, date):
        delta = date.isoweekday() - self.start_weekday
        return date - timedelta(days=delta % 7)

    def get_week_indicator(self, date):
        week_start = self.get_week_start(date)
        return week_start + timedelta(days=self.indicator_delta)

    def get_first_week(self, year):
        indicator_date = self.get_week_indicator(datetime(year, 1, 1))
        if indicator_date.year == year:  # The date "year.1.1" is on 1st week.
            return self.get_week_start(datetime(year, 1, 1))
        else:  # The date "year.1.1" is on the last week of "year-1".
            return self.get_week_start(datetime(year, 1, 8))
    
    def calculate(self, date):
        year = self.get_week_indicator(date).year
        first_date_of_first_week = self.get_first_week(year)
        diff_days = (date - first_date_of_first_week).days
        return year, (diff_days // 7 + 1), (diff_days % 7 + 1)

if __name__ == '__main__':
    # Use like this:
    my_calendar = CustomizedCalendar(start_weekday=WEEKDAY.FRI, indicator_weekday=WEEKDAY.MON)
    print(my_calendar.calculate(datetime(2020, 1, 2)))