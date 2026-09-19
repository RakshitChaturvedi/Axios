import pandas as pd
from datetime import datetime, timedelta

def create_synthetic_csv():
    # Load the data
    fresh_df = pd.read_csv('data/tomato_fresh_data.csv')
    rotten_df = pd.read_csv('data/tomato_rotten_data.csv')
    
    # Clean hardware glitches (like row 0 in rotten data)
    rotten_df = rotten_df[rotten_df['VOC_Raw_Ticks'] > 20000].copy()

    # Start time for the simulation
    current_time = datetime.utcnow()
    
    # Format Fresh Data
    fresh_records = []
    for _, row in fresh_df.iterrows():
        fresh_records.append(format_payload(row, current_time))
        current_time += timedelta(seconds=1)
        
    # Fast forward 48 hours to simulate shipping time
    current_time += timedelta(hours=48)
    
    # Format Rotten Data
    rotten_records = []
    for _, row in rotten_df.iterrows():
        rotten_records.append(format_payload(row, current_time))
        current_time += timedelta(seconds=10)
        
    # Combine and save to CSV
    combined_df = pd.DataFrame(fresh_records + rotten_records)
    
    output_file = 'data/fixtures/synthetic_master_session.csv'
    combined_df.to_csv(output_file, index=False)
    
    print(f"Stitched {len(fresh_records)} fresh and {len(rotten_records)} rotten readings.")
    print(f"Saved synthetic longitudinal session to {output_file}")

def format_payload(row, timestamp):
    return {
        "device_id": "FreshTrace-Node-01",
        "food_type": "tomato",
        "temperature_c": float(row['Temperature_C']),
        "humidity_pct": float(row['Humidity_Pct']),
        "pressure_hpa": 1013.25, 
        "voc_raw": int(row['VOC_Raw_Ticks']),
        "nox_raw": int(row['NOx_Raw_Ticks']),
        "voc_index": int(row.get('VOC_Index', 0)),
        "nox_index": int(row.get('NOx_Index', 0)),
        "received_at": timestamp.isoformat() + "Z"
    }

if __name__ == "__main__":
    create_synthetic_csv()