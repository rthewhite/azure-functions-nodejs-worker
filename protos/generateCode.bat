protoc --js_out=import_style=commonjs,binary:. --grpc_out=. --plugin=protoc-gen-grpc=..\node_modules\grpc-tools\bin\grpc_node_plugin.exe FunctionRpc.proto