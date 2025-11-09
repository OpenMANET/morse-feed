#!/usr/bin/env python3


from collections import defaultdict
import csv
import sys

def channel_to_primary_centre_freqs_khz(centre: float, bw: int) -> list[int]:
    start = int(1000 * (centre - bw / 2 + 0.5))
    end = int(1000 * (centre + bw / 2 - 0.5))
    return list(range(start, end+1, 1000))


def bw2m_channel_to_primary_centre_freqs_khz(centre: float, bw: int) -> list[int]:
    start = int(1000 * (centre - bw / 2 + 1))
    end = int(1000 * (centre + bw / 2 - 1))
    return list(range(start, end + 1, 2000))

# take 2m channel indexes and generate the corresponding 1m channel indexes
# 0 -> 0, 1
# 0,4 -> 0,1,6,7
def idx_doubler(it):
    for i in it:
        yield 2*i
        yield 2*i+1

dr = csv.DictReader(sys.stdin)
dw = csv.DictWriter(
    sys.stdout,
    dr.fieldnames + ["s1g_prim_1mhz_chan_index", "bw2m_s1g_prim_1mhz_chan_index"],
    lineterminator="\n",
)
dw.writeheader()

by_country = defaultdict(list)
for row in dr:
    by_country[row['country_code']].append(row)

for country, rows in by_country.items():
    # Find the 1 and 2 MHz channels that are allowed in this country
    allowed_primary_centre_frequencies_khz = {int(1000 * float(r["centre_freq_mhz"])) for r in rows if r['bw'] == "1"}
    bw2m_allowed_primary_centre_frequencies_khz = {int(1000 * float(r["centre_freq_mhz"])) for r in rows if r['bw'] == "2"}

    for row in rows:
        # Filter out primary channels that correspond to 1 MHz channels that are not allowed in this country.
        # And filter out primary channel indexes that correspond to 2 MHz channels that are not allowed in this country.
        if row['bw'] != "1":
            candidate_primary_freqs = channel_to_primary_centre_freqs_khz(float(row['centre_freq_mhz']), int(row['bw']))
            allowed_primary_indexes = [i for i, p in enumerate(candidate_primary_freqs) if p in allowed_primary_centre_frequencies_khz]

            assert allowed_primary_indexes, f"No allowed primaries for {country}, {row['s1g_chan']}"
            row["s1g_prim_1mhz_chan_index"] = "|".join(map(str, allowed_primary_indexes))

            # Find the 2Mhz channels in the same way, then convert them to 1mhz indexes.
            candidate_primary_freqs = bw2m_channel_to_primary_centre_freqs_khz(float(row['centre_freq_mhz']), int(row['bw']))
            allowed_2m_primary_indexes = [i for i, p in enumerate(candidate_primary_freqs) if p in bw2m_allowed_primary_centre_frequencies_khz]
            allowed_primary_indexes = list(idx_doubler(allowed_2m_primary_indexes))

            assert allowed_primary_indexes, f"No allowed primaries for {country}, {row['s1g_chan']}"
            row["bw2m_s1g_prim_1mhz_chan_index"] = "|".join(map(str, allowed_primary_indexes))
        else:
            row["s1g_prim_1mhz_chan_index"] = "0"

        dw.writerow(row)
