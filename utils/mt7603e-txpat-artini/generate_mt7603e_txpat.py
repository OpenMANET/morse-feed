#
# Copyright 2025 Morse Micro
#
# This is free software, licensed under the 3-Clause BSD License.
#

import array
import argparse

"""
The content of the Tx Power Adjustment Table file is as follow:
    _______________________________________________
   |            text_message                       |
   |            (64bytes)                          |
   |_______________________________________________|
   |            Magic bytes(4 bytes)               |
   |_______________________________________________|
   |     rate_tx_power_adjust_table                |
   |           CCK_1_2M (14 bytes)                 |
   |           CCK_5_11M (14 bytes)                |
   |           OFDM_6_9M (14 bytes)                |
   |           OFDM_12_18M (14 bytes)              |
   |           OFDM_24_36M (14 bytes)              |
   |           OFDM_48M (14 bytes)                 |
   |           OFDM_54M (14 bytes)                 |
   |           MCS_0_8 (14 bytes)                  |
   |           MCS_32 (14 bytes)                   |
   |           MCS_1_2_9_10 (14 bytes)             |
   |           MCS_3_4_11_12 (14 bytes)            |
   |           MCS_5_13 (14 bytes)                 |
   |           MCS_6_14 (14 bytes)                 |
   |           MCS_7_15 (14 bytes)                 |
   |_______________________________________________|
   |     bw_tx_power_adjust_table                  |
   |     40MHz vs 20MHz tx power offset (14 bytes) |
   |_______________________________________________|

* text_message is a ascii string that will be printed as info when loading the file by the driver.
* Magic bytes are hex values, only for validating the content of the file.
* rate_tx_power_adjust_table and bw_tx_power_adjust_table are 8bit signed values. 0xFF means -1, 
*  0xFA means -6,  ... 0x80 means -128.
"""

text_message = "HaLowLink 1 MT7603E TX Power Adjustment Table V1.0"
header = [0xA0, 0xF0, 0xA1, 0xF1]
rate_tx_power_adjust_table= \
[
#  CHANNEL  ->      1    2    3    4    5    6    7    8    9   10   11   12   13   14 */
#RATE
#CCK_1_2M
                   [-6  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-6  ,-6  ,-6  , 0  ],
#CCK_5_11M
                   [-6  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-6  ,-6  ,-6  , 0  ],

#OFDM_6_9M
                   [-8  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-6  ,-6  ,-6  , 0  ],
#OFDM_12_18M
                   [-8  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-6  ,-6  ,-6  , 0  ],
#OFDM_24_36M
                   [-9  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-7  ,-7  ,-7  , 0  ],
#OFDM_48M
                   [-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  , 0  ],
#OFDM_54M
                   [-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  ,-3  , 0  ],

#MCS_0_8
                   [-10 ,-3  ,-2  ,-2  ,-4  ,-4  ,-1  ,-1  ,-1  ,-1  ,-10 ,-10 ,-10 , 0  ],
#MCS_32
                   [ 0  , 0  , 0  , 0  , 0  , 0  , 0  , 0  , 0  , 0  , 0  , 0  , 0  , 0  ],
#MCS_1_2_9_10
                   [-10 ,-3  ,-2  ,-2  ,-4  ,-4  ,-1  ,-1  ,-1  ,-1  ,-10 ,-10 ,-10 , 0  ],
#MCS_3_4_11_12
                   [-10 ,-3  ,-2  ,-2  ,-4  ,-4  ,-2  ,-2  ,-2  ,-2  ,-10 ,-10 ,-10 , 0  ],
#MCS_5_13
                   [-6  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-6  ,-6  ,-6  , 0  ],
#MCS_6_14
                   [-6  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-6  ,-6  ,-6  , 0  ],
#MCS_7_15
                   [-6  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-2  ,-6  ,-6  ,-6  , 0 ]
]

bw_tx_power_adjust_table= [
#   CHANNEL  ->      1    2    3    4    5    6    7    8    9   10   11   12   13   14
#        40M :*/
                    -5  ,-8  ,-6  ,-5  ,-5  ,-8  , 0  , 0  , 0  , 0  ,-6  ,-6  ,-6  , 0
]

def write_row(row, type, file):
    row_array = array.array(type, row)  # Convert row to an int8 array
    row_array.tofile(file)  # Write the row to file

def parse_args():
    parser = argparse.ArgumentParser(description="Generate binary for MT7603E TX Power Adjustment Table.")
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Path to the output binary file."
    )
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    filename = args.output  # Get the file path from command-line argument
    # Ensure the message is exactly 64 bytes (pad with null bytes if needed)
    message_bytes = text_message.encode('ascii')  # Convert to bytes
    message_bytes = message_bytes.ljust(64, b'\x00')  # Pad with null bytes

    with open(filename, "wb") as f:
        f.write(message_bytes)              # Write the 64-byte text message
        write_row(header,'B',f)               # Write the header bytes.
        for row in rate_tx_power_adjust_table:
            write_row(row,'b',f)              # Write rate_tx_power_adjust_table row by row.
        write_row(bw_tx_power_adjust_table,'b',f) # Write the bw_tx_power_adjust_table bytes.
