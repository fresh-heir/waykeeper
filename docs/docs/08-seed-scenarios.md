# 08 · Seed Scenarios

These are realistic examples for development, prompting, QA, and demo flows.

## Scenario 1 · Student-heavy day
### Raw input
- cardio review
- 40 practice questions
- answer emails
- call insurance
- shower
- lunch
- tidy kitchen
- 2:00 PM doctor appointment
- available 8:30 AM to 7:00 PM

### Preferences
- productive breaks

### Expectations
- doctor appointment remains fixed
- study work is protected in larger blocks
- kitchen / insurance / emails may be placed in breaks or lighter intervals

## Scenario 2 · Mixed life day
### Raw input
- grocery run
- finish app mockup
- therapy at 3 PM
- dishes
- text mom back
- laundry
- read chapter 8
- available 9 AM to 6 PM

### Preferences
- restful breaks

### Expectations
- therapy fixed
- app mockup gets meaningful uninterrupted time
- chores stay lower priority
- breaks remain actual breaks

## Scenario 3 · Overfull day
### Raw input
- finish 120 flashcards
- 60 practice questions
- write rotation reflection
- dishes
- vacuum
- answer all emails
- grocery store
- return package
- 1 PM meeting
- 4 PM appointment
- available 8 AM to 5 PM

### Preferences
- productive breaks

### Expectations
- system should warn that the day is overloaded
- lower-priority tasks may be deferred
- hard events remain fixed

## Scenario 4 · Replan from now
### Starting state
Blocks A, B, C, D, E, F were scheduled.
User completed A and B, then finished C at 12:30 PM instead of 11:00 AM.

### Expectations
- completed history remains intact
- remaining blocks D, E, F are reconsidered
- hard events preserved
- lower-priority items may be dropped or shortened

## Scenario 5 · Productive break classification
### Raw input
- answer 1 email
- transfer laundry
- deep study block
- wipe counters
- refill prescription
- read article carefully

### Expectations
- email / laundry / counters may qualify for productive breaks
- deep study and careful reading should not be placed inside productive break windows
