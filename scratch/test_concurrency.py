import os
import sys
import time
import threading
from main import YTDownloaderAPI

def test_api():
    print("Initializing API...")
    api = YTDownloaderAPI()
    
    # Configure concurrency to 2
    print("Setting concurrency to 2...")
    api.set_max_concurrent_downloads(2)
    assert api.get_max_concurrent_downloads() == 2, "Concurrency was not set correctly"
    
    # Mocking self.window to prevent attribute errors on evaluation
    class MockWindow:
        def evaluate_js(self, js):
            print(f"[JS EVAL] {js}")
    api.window = MockWindow()

    # We want to queue a few downloads. We will use a mock download method
    # so we don't actually fetch from YouTube or write files during unit test.
    original_download = api.downloader.download
    
    download_started_events = {}
    download_finish_events = {}
    running_count_lock = threading.Lock()
    active_count = 0
    max_observed_concurrency = 0

    def mock_download(url, options, progress_callback):
        nonlocal active_count, max_observed_concurrency
        dl_id = url.split("?id=")[1]
        
        with running_count_lock:
            active_count += 1
            if active_count > max_observed_concurrency:
                max_observed_concurrency = active_count
            print(f"[{dl_id}] Started mock download. Current active: {active_count}")
        
        download_started_events[dl_id].set()
        
        # Simulate some work
        for i in range(5):
            time.sleep(0.1)
            # Check for cancel
            progress_callback({'status': 'downloading', 'total_bytes': 100, 'downloaded_bytes': (i+1)*20, 'speed': 100, 'eta': 1})
            
        with running_count_lock:
            active_count -= 1
            print(f"[{dl_id}] Finished mock download. Current active: {active_count}")
        
        download_finish_events[dl_id].set()

    api.downloader.download = mock_download

    # Queue 4 mock downloads
    urls = [
        ("task1", "https://mock.com?id=task1"),
        ("task2", "https://mock.com?id=task2"),
        ("task3", "https://mock.com?id=task3"),
        ("task4", "https://mock.com?id=task4"),
    ]

    for dl_id, url in urls:
        download_started_events[dl_id] = threading.Event()
        download_finish_events[dl_id] = threading.Event()
        res = api.start_download(dl_id, url, {})
        print(f"Queueing {dl_id}: {res}")

    # Wait for task1 and task2 to start
    print("Waiting for task1 and task2 to start...")
    download_started_events["task1"].wait(timeout=2)
    download_started_events["task2"].wait(timeout=2)
    
    # Task3 and Task4 should NOT have started yet (concurrency is 2)
    assert not download_started_events["task3"].is_set(), "Task3 started prematurely (concurrency limit violated!)"
    assert not download_started_events["task4"].is_set(), "Task4 started prematurely (concurrency limit violated!)"
    print("Concurrency limit is respected!")

    # Now let's cancel task4 while it is still queued
    print("Cancelling queued task4...")
    cancel_res = api.cancel_download("task4")
    print(f"Cancel task4 result: {cancel_res}")
    
    # Verify task4 is removed from queue
    with api.queue_lock:
        in_queue = any(item[0] == "task4" for item in api.download_queue)
    assert not in_queue, "Task4 was not removed from queue"
    print("Queued task cancellation verified!")

    # Wait for task1 and task2 to finish
    print("Waiting for task1 and task2 to finish...")
    download_finish_events["task1"].wait(timeout=2)
    download_finish_events["task2"].wait(timeout=2)

    # Now task3 should start
    print("Waiting for task3 to start...")
    download_started_events["task3"].wait(timeout=2)
    assert download_started_events["task3"].is_set(), "Task3 failed to start after prior tasks finished"
    
    # Wait for task3 to finish
    download_finish_events["task3"].wait(timeout=2)

    print(f"Max observed concurrency: {max_observed_concurrency}")
    assert max_observed_concurrency <= 2, f"Expected max concurrency <= 2, got {max_observed_concurrency}"
    print("All queue concurrency assertions passed!")

    # Restore original method
    api.downloader.download = original_download

if __name__ == "__main__":
    test_api()
