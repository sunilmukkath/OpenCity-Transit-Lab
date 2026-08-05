.PHONY: data web install-etl install-web

install-etl:
	cd etl && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

install-web:
	cd apps/web && npm install

data:
	cd etl && . .venv/bin/activate && cd .. && python etl/run_pipeline.py

web:
	cd apps/web && npm run dev
