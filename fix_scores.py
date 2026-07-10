import sys
f = 'pocs/ieee-itss-conference-dashboard/frontend/src/App.tsx'
c = open(f, encoding='utf-8').read()

old_start = '<Alert className="section-gap" type="info" showIcon message="Current formula"'
idx = c.find(old_start)
if idx == -1:
    print('ERROR: could not find formula alert')
    sys.exit(1)

close_alert = c.find('/>', idx)
end_of_alert = close_alert + 2

btn_block = '\n            <Divider />\n            <Space>\n              <Button\n                type="primary"\n                icon={<ReloadOutlined />}\n                onClick={() => {\n                  saveScoreSettings.mutate(scoreSettings);\n                }}\n                loading={saveScoreSettings.isPending}\n              >\n                Save Settings & Recalculate All Scores\n              </Button>\n              <span className="muted">Saves current score weights, penalties, caps and recalculates every conference.</span>\n            </Space>'

c = c[:end_of_alert] + btn_block + c[end_of_alert:]

open(f, 'w', encoding='utf-8').write(c)
print('SUCCESS')
