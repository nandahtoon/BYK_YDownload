import asyncio
import json
import threading
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Any
import uvicorn

from main import YTDownloaderAPI

app = FastAPI()

class WebDownloaderAPI(YTDownloaderAPI):
    def __init__(self):
        super().__init__()
        self.active_websockets: List[WebSocket] = []
        # Create a dedicated event loop for background WebSocket pushes
        self._loop = asyncio.new_event_loop()
        def start_loop(loop):
            asyncio.set_event_loop(loop)
            loop.run_forever()
        threading.Thread(target=start_loop, args=(self._loop,), daemon=True).start()
        
    def _evaluate_js(self, script):
        super()._evaluate_js(script)
        
        async def send_to_all():
            for ws in self.active_websockets.copy():
                try:
                    await ws.send_text(script)
                except:
                    pass
        
        # Schedule the coroutine in our dedicated background loop
        asyncio.run_coroutine_threadsafe(send_to_all(), self._loop)


api_instance = WebDownloaderAPI()

class ApiCall(BaseModel):
    args: List[Any]

def create_route(method_name):
    @app.post(f'/api/{method_name}')
    async def api_route(call: ApiCall):
        func = getattr(api_instance, method_name)
        result = await asyncio.to_thread(func, *call.args)
        return result

for attr_name in dir(api_instance):
    if not attr_name.startswith('_') and callable(getattr(api_instance, attr_name)):
        create_route(attr_name)

@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    api_instance.active_websockets.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        api_instance.active_websockets.remove(websocket)

app.mount('/', StaticFiles(directory='web', html=True), name='web')

if __name__ == '__main__':
    print('Starting Web Server on http://localhost:8000')
    uvicorn.run(app, host='0.0.0.0', port=8000)
