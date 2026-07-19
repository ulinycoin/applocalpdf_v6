#!/usr/bin/env python3
"""MCP server for Google Search Console — for Cursor IDE"""

import json, sys, os
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']
KEY_PATH = os.path.expanduser('~/.gsc-service-account.json')
SITE_URL = 'https://localpdf.online/'  # URL-prefix property; SA has no sc-domain access

creds = service_account.Credentials.from_service_account_file(KEY_PATH, scopes=SCOPES)
service = build('searchconsole', 'v1', credentials=creds)

def handle_request(req):
    method = req.get('method', '')
    params = req.get('params', {})

    if method == 'tools/list':
        return {
            "tools": [
                {
                    "name": "gsc_query",
                    "description": "Query GSC search analytics data",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "start_date": {"type": "string", "description": "YYYY-MM-DD (default: 7 days ago)"},
                            "end_date": {"type": "string", "description": "YYYY-MM-DD (default: today)"},
                            "dimension": {"type": "string", "enum": ["query", "page", "country", "device", "date"], "description": "Group results by this dimension"},
                            "row_limit": {"type": "integer", "description": "Max results (default: 10)"}
                        }
                    }
                },
                {
                    "name": "gsc_top_pages",
                    "description": "Top pages by clicks from GSC",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "start_date": {"type": "string"},
                            "end_date": {"type": "string"},
                            "row_limit": {"type": "integer"}
                        }
                    }
                },
                {
                    "name": "gsc_top_queries",
                    "description": "Top queries by clicks from GSC",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "start_date": {"type": "string"},
                            "end_date": {"type": "string"},
                            "row_limit": {"type": "integer"}
                        }
                    }
                },
                {
                    "name": "gsc_query_by_page",
                    "description": "Get queries for a specific page",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "page": {"type": "string", "description": "Full URL or path (e.g. /features/edit-pdf)"},
                            "start_date": {"type": "string"},
                            "end_date": {"type": "string"},
                            "row_limit": {"type": "integer"}
                        },
                        "required": ["page"]
                    }
                }
            ]
        }

    elif method == 'tools/call':
        tool_name = params.get('name', '')
        args = params.get('arguments', {})

        try:
            if tool_name in ('gsc_query', 'gsc_top_pages', 'gsc_top_queries', 'gsc_query_by_page'):
                start = args.get('start_date', '2026-07-12')
                end = args.get('end_date', '2026-07-19')
                limit = args.get('row_limit', 10)

                dim = args.get('dimension', 'query')
                if tool_name == 'gsc_top_pages':
                    dim = 'page'
                elif tool_name == 'gsc_top_queries':
                    dim = 'query'

                body = {
                    'startDate': start,
                    'endDate': end,
                    'dimensions': [dim],
                    'rowLimit': limit,
                }

                if tool_name == 'gsc_query_by_page':
                    page_url = args.get('page', '')
                    if not page_url.startswith('http'):
                        page_url = f'https://localpdf.online{page_url}'
                    body['dimensions'] = ['query']
                    body['dimensionFilterGroups'] = [{
                        'filters': [{'dimension': 'page', 'expression': page_url}]
                    }]

                result = service.searchanalytics().query(siteUrl=SITE_URL, body=body).execute()
                rows = result.get('rows', [])

                out = []
                for r in rows[:limit]:
                    keys = r.get('keys', [])
                    row_data = {
                        'clicks': r.get('clicks', 0),
                        'impressions': r.get('impressions', 0),
                        'ctr': round(r.get('ctr', 0) * 100, 2),
                        'position': round(r.get('position', 0), 1),
                    }
                    if len(keys) > 0:
                        row_data[dim] = keys[0]
                    out.append(row_data)

                return {"content": [{"type": "text", "text": json.dumps(out, indent=2, ensure_ascii=False)}]}

            return {"content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}]}

        except Exception as e:
            return {"content": [{"type": "text", "text": f"Error: {str(e)}"}]}

    return {"error": f"Unknown method: {method}"}

if __name__ == '__main__':
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = handle_request(req)
            sys.stdout.write(json.dumps(resp) + '\n')
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"error": str(e)}) + '\n')
            sys.stdout.flush()
