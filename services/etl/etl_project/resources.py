from dagster import ConfigurableResource

from etl_project.s3_client import create_s3_client


class S3Resource(ConfigurableResource):
    endpoint_url: str | None = None
    region_name: str = "us-east-1"
    access_key_id: str | None = None
    secret_access_key: str | None = None

    def get_client(self):
        return create_s3_client(
            endpoint_url=self.endpoint_url,
            region_name=self.region_name,
            access_key_id=self.access_key_id,
            secret_access_key=self.secret_access_key,
        )
