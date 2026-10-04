"""Trade analyzer: how a trade changes your STARTING LINEUP.

A trade doesn't change your roster's total points, it changes which
players you actually start — bench points only count when a bench
player gets promoted.

v1 evaluates a generic week, so bench depth is undervalued: it misses
bye-week coverage (certain) and injury insurance (probabilistic).
Both arrive by evaluating real weeks instead of a generic one.
"""

from typing import NamedTuple

class Player(NamedTuple):
    name: str
    position: str
    projection: float

# Slot order matters: restrictive slots first, flex-type slots last.
STANDARD_SLOTS = [
    ("QB", {"QB"}),
    ("RB1", {"RB"}),
    ("RB2", {"RB"}),
    ("WR1", {"WR"}),
    ("WR2", {"WR"}),
    ("TE", {"TE"}),
]

def fill_lineup(players,slots):
    """Assign players to slots, maximize projected points"""

    raise NotImplementedError

def evaluate_trade(roster, gives, gets, slots, weeks_left=1):
    """what trade does to one sides starting lineup
    
    Returns a dict with before, after, delta_per_week, delta_total,
    and roster_total_change (so you can see them disagree)."""

    raise NotImplementedError

if __name__ == "__main__":
    roster = [
        Player("QB1", "QB", 20),
        Player("RB1", "RB", 30),
        Player("RB2", "RB", 16),
        Player("RB3", "RB", 4),
        Player("WR1", "WR", 17),
        Player("WR2", "WR", 15),
        Player("WR3", "WR", 3),
        Player("WR4", "WR", 5),
        Player("TE1", "TE", 10),
    ]
    gives = [p for p in roster if p.name in ("WR1", "WR2")]
    gets = [Player("StudRB", "RB", 34)]

    result = evaluate_trade(roster, gives, gets, STANDARD_SLOTS, weeks_left=10)

    print(f"starting lineup before : {result['before']}")
    print(f"starting lineup after  : {result['after']}")
    print(f"delta per week         : {result['delta_per_week']:+}")
    print(f"roster total change    : {result['roster_total_change']:+}")

    assert result["before"] == 108, result["before"]
    assert result["after"] == 102, result["after"]
    assert result["delta_per_week"] == -6
    assert result["roster_total_change"] == +2
    print("\nPASS — roster total went UP 2 while the lineup went DOWN 6.")